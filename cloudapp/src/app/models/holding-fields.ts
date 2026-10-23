/**
 * Delfält i MARC 852 (https://www.loc.gov/marc/holdings/hd852.html) som appen kan läsa och skriva,
 * med den egenskap de motsvarar i Libris JSON-LD. Mappningen följer Libris konverteringstabell
 * (librisxl, whelk-core/src/main/resources/ext/marcframe-hold.json).
 *
 * Delfälten b (sigel), 6 (länkning) och 8 (grupp-id) ingår inte: de styr struktur och inte innehåll.
 */
export type HoldingFieldKind = 'text' | 'link-label' | 'link-code';

export interface HoldingField {
    code: string;               // delfältskod (c, h, j, ...)
    property: string;           // egenskap i Libris JSON-LD
    kind: HoldingFieldKind;     // text = värdet ligger direkt, link-label/link-code = underobjekt med label/code
    repeatable: boolean;        // kan upprepas (skrivs som lista, redigeras med | mellan värdena)
    resourceType?: string;      // @type på underobjekt som skapas på nytt
}

export const HOLDING_FIELDS: HoldingField[] = [
    { code: 'a', property: 'location', kind: 'text', repeatable: false },
    { code: 'c', property: 'physicalLocation', kind: 'text', repeatable: true },
    { code: 'd', property: 'formerShelfLocation', kind: 'text', repeatable: true },
    { code: 'e', property: 'address', kind: 'text', repeatable: true },
    { code: 'f', property: 'codedLocationQualifier', kind: 'text', repeatable: true },
    { code: 'g', property: 'nonCodedLocationQualifier', kind: 'text', repeatable: true },
    { code: 'h', property: 'shelfMark', kind: 'link-label', repeatable: false, resourceType: 'ShelfMarkSequence' },
    { code: 'i', property: 'availability', kind: 'link-label', repeatable: true, resourceType: 'ItemAvailability' },
    { code: 'j', property: 'shelfControlNumber', kind: 'text', repeatable: false },
    { code: 'k', property: 'callNumberPrefix', kind: 'text', repeatable: true },
    { code: 'l', property: 'shelfLabel', kind: 'text', repeatable: false },
    { code: 'm', property: 'callNumberSuffix', kind: 'text', repeatable: true },
    { code: 'n', property: 'country', kind: 'link-code', repeatable: false, resourceType: 'Country' },
    { code: 'p', property: 'marc:pieceDesignation', kind: 'text', repeatable: false },
    { code: 'q', property: 'itemCondition', kind: 'text', repeatable: false },
    { code: 's', property: 'copyrightArticleFeeCode', kind: 'text', repeatable: true },
    { code: 't', property: 'copyNumber', kind: 'text', repeatable: false },
    { code: 'u', property: 'uri', kind: 'text', repeatable: true },
    { code: 'x', property: 'cataloguersNote', kind: 'text', repeatable: true },
    { code: 'z', property: 'hasNote', kind: 'link-label', repeatable: true, resourceType: 'Note' },
    { code: '2', property: 'marc:sourceOfClassificationOrShelfMarkScheme', kind: 'text', repeatable: false },
    { code: '3', property: 'appliesTo', kind: 'link-label', repeatable: false, resourceType: 'Resource' },
];

//Standard: samma sex delfält som appen alltid har använt
export const DEFAULT_FIELDS = ['c', 'h', 'j', 'l', 't', 'i'];

//Mellan värdena i ett upprepat fält (visning och redigering)
export const VALUE_SEPARATOR = ' | ';

export function fieldByCode(code: string): HoldingField {
    return HOLDING_FIELDS.find(f => f.code === code);
}

/**
 * Gör om en sparad lista till giltiga delfält i fast ordning. Saknas listan (äldre konfiguration)
 * eller blir den tom används standard.
 */
export function normalizeFields(list: any): string[] {
    const wanted = Array.isArray(list) ? list.map(String) : [];
    const valid = HOLDING_FIELDS.map(f => f.code).filter(code => wanted.includes(code));
    return valid.length > 0 ? valid : DEFAULT_FIELDS.slice();
}

function asArray(value: any): any[] {
    return Array.isArray(value) ? value : (value === undefined || value === null ? [] : [value]);
}

//Text ur ett underobjekt (label är en sträng eller en lista)
function labelOf(node: any): string {
    if (node === undefined || node === null) { return ''; }
    if (typeof node !== 'object') { return String(node); }
    const label = Array.isArray(node.label) ? node.label[0] : node.label;
    return label === undefined || label === null ? '' : String(label);
}

function codeOf(node: any): string {
    if (node === undefined || node === null) { return ''; }
    if (typeof node !== 'object') { return String(node); }
    if (node.code) { return String(node.code); }
    const id = node['@id'] ? String(node['@id']) : '';
    return id.substring(id.lastIndexOf('/') + 1);
}

/**
 * Läser ett delfält ur en nod (beståndet själv eller en komponent i hasComponent) som en sträng.
 * Upprepade värden skiljs med " | ".
 */
export function readFieldValue(node: any, field: HoldingField): string {
    if (!node) { return ''; }
    const raw = node[field.property];
    let values: string[];
    switch (field.kind) {
        case 'link-label':
            values = asArray(raw).map(labelOf);
            break;
        case 'link-code':
            values = asArray(raw).map(codeOf);
            break;
        default:
            values = asArray(raw).map(v => typeof v === 'object' ? labelOf(v) : String(v));
    }
    values = values.map(v => v.trim()).filter(v => v !== '');
    return values.join(field.repeatable ? VALUE_SEPARATOR : ' ');
}

/**
 * En rad (852) med alla stödda delfält som strängar, plus sigel (b) och gruppnummer (8).
 * Alla delfält läses oavsett inställning, så att formulär och matchning mot Alma alltid har värdena.
 */
export function readRow(node: any, sigel: string, groupid: string): any {
    const row: any = { '8': groupid || '', b: sigel };
    for (const field of HOLDING_FIELDS) {
        row[field.code] = readFieldValue(node, field);
    }
    return row;
}

function splitValues(field: HoldingField, value: string): string[] {
    const text = String(value === undefined || value === null ? '' : value).trim();
    if (text === '') { return []; }
    if (!field.repeatable) { return [text]; }
    return text.split('|').map(v => v.trim()).filter(v => v !== '');
}

/**
 * Skriver ett delfält till en nod. Tomt värde tar bort egenskapen. Befintlig form på underobjekt
 * (typ, label som sträng eller lista, ensamt objekt eller lista) bevaras.
 */
export function writeFieldValue(target: any, field: HoldingField, value: string): void {
    const items = splitValues(field, value);
    if (items.length === 0) {
        delete target[field.property];
        return;
    }
    const existingRaw = target[field.property];
    const existingList = asArray(existingRaw);
    const wasList = Array.isArray(existingRaw);

    switch (field.kind) {
        case 'text':
            target[field.property] = field.repeatable ? items : items[0];
            break;
        case 'link-label': {
            const objects = items.map((text, i) => {
                const template = existingList[i] || existingList[0];
                const base = template && typeof template === 'object'
                    ? { ...template }
                    : { '@type': field.resourceType };
                const labelIsList = !!template && typeof template === 'object' && Array.isArray(template.label);
                return { ...base, label: labelIsList ? [text] : text };
            });
            target[field.property] = (field.repeatable || wasList) ? objects : objects[0];
            break;
        }
        case 'link-code': {
            const objects = items.map((text, i) => {
                const template = existingList[i] || existingList[0];
                const base = template && typeof template === 'object' ? { ...template } : { '@type': field.resourceType };
                delete base['@id'];
                return { ...base, code: text };
            });
            target[field.property] = (field.repeatable || wasList) ? objects : objects[0];
            break;
        }
    }
}
