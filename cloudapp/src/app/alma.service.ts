import { Injectable } from '@angular/core';
import { CloudAppRestService, HttpMethod } from '@exlibris/exl-cloudapp-angular-lib';
import { from, of } from 'rxjs';
import { map, catchError, mergeMap, toArray } from 'rxjs/operators';

export interface AlmaItem {
    pid: string;
    holding_id: string;
    barcode: string;
    description: string;
    enumeration: string;
    callnumber: string;       //exemplarets egen alternativa hyllkod, annars holdingens
    location: string;
    status: string;
    process_type: string;
    process_desc?: string;    //läsbar text för process (t.ex. lån)
    requested?: boolean;
    po_line?: string;
    not_in_place?: boolean;
}

export interface AlmaHolding {
    holding_id: string;
    library: string;
    location: string;
    call_number: string;
    items: AlmaItem[];
}

export interface AlmaDeletePlan {
    mmsId: string;
    items: AlmaItem[];
    //Holdings-poster som tas bort (när de blir tomma, eller alla vid "ta bort alla")
    holdings: AlmaHolding[];
}

export interface AlmaDeleteResult {
    deleted: string[];
    failed: { label: string, message: string }[];
    deletedPids?: string[];          //exemplar som faktiskt togs bort
    deletedHoldingIds?: string[];    //holdings-poster som faktiskt togs bort
    snapshot?: AlmaSnapshot;         //kopia av det som togs bort (för att kunna ångra)
}

/**
 * Kopia av Alma-poster som togs bort, tillräcklig för att skapa dem på nytt
 */
export interface AlmaSnapshot {
    mmsId: string;
    holdings: { holding_id: string, label: string, record: any }[];
    items: { holding_id: string, pid: string, label: string, record: any }[];
}

export interface AlmaRestoreResult {
    created: string[];
    failed: { label: string, message: string }[];
}

/**
 * Åtgärder i Alma (holdings och exemplar) via Cloud Apps REST-tjänst.
 * Användarens egna Alma-rättigheter gäller, ingen API-nyckel används.
 */
@Injectable()
export class AlmaService {
    constructor(private restService: CloudAppRestService) {}

    normalize(value: string): string {
        return (value || '').toLowerCase().replace(/\s+/g, ' ').trim();
    }

    private asArray(value: any): any[] {
        return Array.isArray(value) ? value : (value ? [value] : []);
    }

    /**
     * Hämtar bibliotekets holdings-poster på bib-posten, med exemplar
     */
    async getLibraryHoldings(mmsId: string, libraryCode: string): Promise<AlmaHolding[]> {
        const list = await this.restService.call(`/bibs/${mmsId}/holdings`).toPromise();
        const holdings: AlmaHolding[] = this.asArray(list.holding)
            .filter(h => h.library && h.library.value && h.library.value.toLowerCase() === libraryCode.toLowerCase())
            .map(h => ({
                holding_id: h.holding_id,
                library: h.library.value,
                location: h.location && h.location.value,
                call_number: h.call_number,
                items: []
            }));

        for (const holding of holdings) {
            let offset = 0;
            let total = 0;
            do {
                const res = await this.restService.call({
                    url: `/bibs/${mmsId}/holdings/${holding.holding_id}/items`,
                    queryParams: { limit: 100, offset: offset }
                }).toPromise();
                total = Number(res.total_record_count) || 0;
                const items = this.asArray(res.item);
                for (const i of items) {
                    const data = i.item_data || {};
                    holding.items.push({
                        pid: data.pid,
                        holding_id: holding.holding_id,
                        barcode: data.barcode,
                        description: data.description,
                        enumeration: data.enumeration_a,
                        callnumber: data.alternative_call_number || (i.holding_data && i.holding_data.call_number) || holding.call_number,
                        location: data.location && data.location.value,
                        status: data.base_status && data.base_status.desc,
                        process_type: data.process_type && data.process_type.value,
                        process_desc: data.process_type && data.process_type.desc,
                        requested: data.requested === true || data.requested === 'true',
                        po_line: data.po_line,
                        not_in_place: !!(data.base_status && String(data.base_status.value) === '0')
                    });
                }
                offset += 100;
                if (items.length === 0) { break; }
            } while (offset < total);
        }
        return holdings;
    }

    /**
     * Vilka hyllkoder en Libris-rad kan motsvara i Alma. Libris-raden byggs av delar (h#, j#, l# m.fl.),
     * och Almas hyllkod kan vara sammansatt av olika delar, så flera kombinationer prövas.
     */
    candidateCallNumbers(row: any): string[] {
        const h = this.normalize(row.h);
        const j = this.normalize(row.j);
        const l = this.normalize(row.l);
        const combos = [
            [h, j], [h, l], [h, l, j], [h, j, l], [h], [j], [l, j], [j, l], [h, j, l, this.normalize(row.t)]
        ];
        const set = new Set<string>();
        for (const combo of combos) {
            const text = combo.filter(part => part !== '').join(' ');
            if (text !== '') { set.add(text); }
        }
        return Array.from(set);
    }

    /**
     * Exemplar i Alma vars hyllkod motsvarar någon av Libris-raderna
     */
    matchItems(holdings: AlmaHolding[], rows: any[]): AlmaItem[] {
        const wanted = new Set<string>();
        rows.forEach(row => this.candidateCallNumbers(row).forEach(c => wanted.add(c)));
        const matched: AlmaItem[] = [];
        for (const holding of holdings) {
            for (const item of holding.items) {
                if (wanted.has(this.normalize(item.callnumber))) { matched.push(item); }
            }
        }
        return matched;
    }

    /**
     * Varningar i förväg: vilka av exemplaren som troligen inte går att ta bort i Alma och varför.
     * Texterna är nycklar som översätts i dialogen.
     */
    deleteWarnings(items: AlmaItem[]): { label: string, reasons: string[] }[] {
        const warnings = [];
        for (const item of items) {
            const reasons: string[] = [];
            if (item.process_type) { reasons.push(item.process_desc || item.process_type); }
            if (item.not_in_place && !item.process_type) { reasons.push('notinplace'); }
            if (item.requested) { reasons.push('requested'); }
            if (item.po_line) { reasons.push('poline'); }
            if (reasons.length > 0) {
                warnings.push({ label: this.itemLabel(item), reasons: reasons });
            }
        }
        return warnings;
    }

    /**
     * Tar bort alla bibliotekets holdings och exemplar
     */
    planAll(mmsId: string, holdings: AlmaHolding[]): AlmaDeletePlan {
        return {
            mmsId: mmsId,
            items: [].concat(...holdings.map(h => h.items)),
            holdings: holdings
        };
    }

    /**
     * Tar bort valda exemplar. En holdings-post som blir utan exemplar tas bort också.
     */
    planItems(mmsId: string, holdings: AlmaHolding[], selected: AlmaItem[]): AlmaDeletePlan {
        const selectedPids = new Set(selected.map(i => i.pid));
        const emptied = holdings.filter(h => h.items.length > 0 && h.items.every(i => selectedPids.has(i.pid)));
        return { mmsId: mmsId, items: selected, holdings: emptied };
    }

    private errorText(err: any): string {
        const list = err && err.error && err.error.errorList && err.error.errorList.error;
        const first = Array.isArray(list) ? list[0] : list;
        if (first && first.errorMessage) {
            return (first.errorCode ? first.errorCode + ': ' : '') + first.errorMessage;
        }
        return (err && err.message) || String(err);
    }

    /**
     * Hämtar fullständiga poster (holdings och exemplar) i planen, som kopia innan de tas bort.
     */
    async snapshot(plan: AlmaDeletePlan): Promise<AlmaSnapshot> {
        const snapshot: AlmaSnapshot = { mmsId: plan.mmsId, holdings: [], items: [] };
        for (const holding of plan.holdings) {
            const record = await this.restService.call(`/bibs/${plan.mmsId}/holdings/${holding.holding_id}`).toPromise();
            snapshot.holdings.push({ holding_id: holding.holding_id, label: this.holdingLabel(holding), record: record });
        }
        for (const item of plan.items) {
            const record = await this.restService.call(
                `/bibs/${plan.mmsId}/holdings/${item.holding_id}/items/${item.pid}`).toPromise();
            snapshot.items.push({ holding_id: item.holding_id, pid: item.pid, label: this.itemLabel(item), record: record });
        }
        return snapshot;
    }

    /**
     * Behåller bara det som togs bort i Alma (exemplar eller holdings som inte kunde tas bort ska inte återskapas)
     */
    filterSnapshot(snapshot: AlmaSnapshot, result: AlmaDeleteResult): AlmaSnapshot {
        const pids = new Set(result.deletedPids || []);
        const holdingIds = new Set(result.deletedHoldingIds || []);
        return {
            mmsId: snapshot.mmsId,
            holdings: snapshot.holdings.filter(h => holdingIds.has(h.holding_id)),
            items: snapshot.items.filter(i => pids.has(i.pid))
        };
    }

    //Fält som Alma sätter själv och inte ska skickas när en post skapas på nytt
    private cleanHolding(record: any) {
        const copy = JSON.parse(JSON.stringify(record));
        ['holding_id', 'link', 'bib_data', 'created_by', 'created_date', 'last_modified_by', 'last_modified_date',
         'calculated_suppress_from_publishing'].forEach(key => delete copy[key]);
        //001 är Almas id för den gamla holdings-posten
        const marc = copy.record;
        if (marc && Array.isArray(marc.controlfield)) {
            marc.controlfield = marc.controlfield.filter(f => f.tag !== '001');
        }
        return copy;
    }

    private xmlEscape(value: any): string {
        return String(value === undefined || value === null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /**
     * Alma tar bara emot XML när en holdings-post skapas ("JSON is not supported for this API"),
     * så MARC-posten från JSON-kopian skrivs om till <holding><record>…</record></holding>.
     */
    private holdingXml(record: any): string {
        //Almas JSON lägger MARC-posten som XML-text i "anies" (som för bib-poster)
        const anies = this.asArray(record && record.anies).filter(a => typeof a === 'string');
        if (anies.length > 0) {
            const marcXml = anies.join('')
                .replace(/<\?xml[^>]*\?>/g, '')
                .replace(/<controlfield\s+tag="001"[^>]*\/>/g, '')
                .replace(/<controlfield\s+tag="001"[^>]*>[^<]*<\/controlfield>/g, '')
                .trim();
            return /^<holding[\s>]/.test(marcXml) ? marcXml : '<holding>' + marcXml + '</holding>';
        }
        const marc = record && record.record;
        if (!marc) {
            throw new Error('Holdings-kopian saknar MARC-post (fält: ' + Object.keys(record || {}).join(', ') + ')');
        }
        const esc = (v: any) => this.xmlEscape(v);
        let xml = '<holding><record>';
        xml += `<leader>${esc(marc.leader)}</leader>`;
        for (const f of this.asArray(marc.controlfield)) {
            xml += `<controlfield tag="${esc(f.tag)}">${esc(f.content)}</controlfield>`;
        }
        for (const f of this.asArray(marc.datafield)) {
            xml += `<datafield tag="${esc(f.tag)}" ind1="${esc(f.ind1 === undefined ? ' ' : f.ind1)}" ind2="${esc(f.ind2 === undefined ? ' ' : f.ind2)}">`;
            for (const s of this.asArray(f.subfield)) {
                xml += `<subfield code="${esc(s.code)}">${esc(s.content)}</subfield>`;
            }
            xml += '</datafield>';
        }
        xml += '</record></holding>';
        return xml;
    }

    //Svaret kan komma som JSON eller som XML-text beroende på vad Alma väljer
    private newHoldingId(created: any): string {
        if (created && typeof created === 'object' && created.holding_id) {
            return String(created.holding_id);
        }
        const match = /<holding_id>\s*(\d+)\s*<\/holding_id>/.exec(typeof created === 'string' ? created : JSON.stringify(created || ''));
        if (!match) {
            throw new Error('Alma svarade utan ett nytt holdings-id');
        }
        return match[1];
    }

    private cleanItem(record: any) {
        const copy = JSON.parse(JSON.stringify(record));
        delete copy.link;
        delete copy.bib_data;
        delete copy.holding_data;
        const data = copy.item_data || {};
        ['pid', 'creation_date', 'modification_date', 'base_status', 'awaiting_reshelving', 'last_modified_by'].forEach(key => delete data[key]);
        copy.item_data = data;
        return copy;
    }

    /**
     * Skapar de borttagna posterna på nytt: holdings först (nytt id), därefter deras exemplar.
     * Exemplar vars holdings-post inte togs bort läggs i den befintliga holdings-posten.
     */
    async restore(snapshot: AlmaSnapshot): Promise<AlmaRestoreResult> {
        const result: AlmaRestoreResult = { created: [], failed: [] };
        const idMap: { [oldId: string]: string } = {};
        const failedHoldings = new Set<string>();

        for (const holding of snapshot.holdings) {
            try {
                const created = await this.restService.call({
                    url: `/bibs/${snapshot.mmsId}/holdings`,
                    method: HttpMethod.POST,
                    headers: { 'Content-Type': 'application/xml', 'Accept': 'application/json' },
                    requestBody: this.holdingXml(this.cleanHolding(holding.record))
                }).toPromise();
                idMap[holding.holding_id] = this.newHoldingId(created);
                result.created.push(holding.label);
            } catch (err) {
                failedHoldings.add(holding.holding_id);
                result.failed.push({ label: holding.label, message: this.errorText(err) });
            }
        }

        for (const item of snapshot.items) {
            if (failedHoldings.has(item.holding_id)) {
                result.failed.push({ label: item.label, message: 'Holdings-posten kunde inte skapas' });
                continue;
            }
            const holdingId = idMap[item.holding_id] || item.holding_id;
            try {
                await this.restService.call({
                    url: `/bibs/${snapshot.mmsId}/holdings/${holdingId}/items`,
                    method: HttpMethod.POST,
                    requestBody: this.cleanItem(item.record)
                }).toPromise();
                result.created.push(item.label);
            } catch (err) {
                result.failed.push({ label: item.label, message: this.errorText(err) });
            }
        }
        return result;
    }

    /**
     * Exemplar först (max 10 samtidiga, utan tvång), därefter holdings-poster.
     * En holdings-post tas bara bort om alla dess exemplar i planen lyckades.
     * Bib-posten rörs aldrig (bib=retain).
     */
    async executeDelete(plan: AlmaDeletePlan): Promise<AlmaDeleteResult> {
        const result: AlmaDeleteResult = { deleted: [], failed: [], deletedPids: [], deletedHoldingIds: [] };
        const failedPids = new Set<string>();

        const outcomes = await from(plan.items).pipe(
            mergeMap(item => this.restService.call({
                url: `/bibs/${plan.mmsId}/holdings/${item.holding_id}/items/${item.pid}`,
                method: HttpMethod.DELETE,
                queryParams: { override: 'false', holdings: 'retain', bib: 'retain' }
            }).pipe(
                map(() => ({ item: item, error: null as any })),
                catchError(err => of({ item: item, error: err }))
            ), 10),
            toArray()
        ).toPromise();

        for (const outcome of outcomes) {
            const label = this.itemLabel(outcome.item);
            if (outcome.error) {
                failedPids.add(outcome.item.pid);
                result.failed.push({ label: label, message: this.errorText(outcome.error) });
            } else {
                result.deleted.push(label);
                result.deletedPids.push(outcome.item.pid);
            }
        }

        for (const holding of plan.holdings) {
            if (holding.items.some(i => failedPids.has(i.pid))) {
                result.failed.push({ label: this.holdingLabel(holding), message: 'Holdings-posten behålls eftersom ett exemplar inte kunde tas bort' });
                continue;
            }
            try {
                await this.restService.call({
                    url: `/bibs/${plan.mmsId}/holdings/${holding.holding_id}`,
                    method: HttpMethod.DELETE,
                    queryParams: { bib: 'retain' }
                }).toPromise();
                result.deleted.push(this.holdingLabel(holding));
                result.deletedHoldingIds.push(holding.holding_id);
            } catch (err) {
                result.failed.push({ label: this.holdingLabel(holding), message: this.errorText(err) });
            }
        }
        return result;
    }

    itemLabel(item: AlmaItem): string {
        return [item.callnumber, item.barcode ? '(' + item.barcode + ')' : '', item.description].filter(p => p).join(' ');
    }

    holdingLabel(holding: AlmaHolding): string {
        return 'Holdings: ' + [holding.library, holding.location, holding.call_number].filter(p => p).join(' / ');
    }
}
