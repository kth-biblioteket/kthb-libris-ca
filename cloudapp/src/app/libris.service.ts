import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from "@angular/common/http";
import { TranslateService } from '@ngx-translate/core';

@Injectable()
export class LibrisService {
    constructor (
        private http: HttpClient,
        private translate: TranslateService,
    ) {}

    sort_by_key(array, key) {
        return array.sort(function(a, b) {
          var x = a[key]; var y = b[key];
          return ((x < y) ? -1 : ((x > y) ? 1 : 0));
        });
    }

    /**
     * Funktion som skapar rätt Libris-url
     * beroende på vilken typ av Libris-identifierare(i 035) en post har i Alma
     * 
     * @param librisid 
     * @param librisidtype 
     * @param proxyURL 
     * @returns 
     */
    librisurl = (librisid: string, librisidtype: string, proxyURL: string) => {
        if (librisidtype == 'libris3') {
            console.log(proxyURL );
            return `${proxyURL}/find.jsonld?meta.identifiedBy.@type=LibrisIIINumber&meta.identifiedBy.value=${librisid}`;
        } else {
            return `${proxyURL}/find.jsonld?meta.controlNumber=${librisid}`;
        }
    }

    /**
     * Funktion som hämtar huvudinstansen i Libris via id
     * 
     * @param id 
     * @param type 
     * @param url 
     * @returns 
     */
    getLibrisInstance(id, type, url) {
        var res = this.http.get<any>(this.librisurl(id, type, url), {})
        return res
    }

    /**
     * Funktion som konstaterar vilken LibrisID-typ
     * som finns i network_number(035-fältet i marc-posten)
     * 
     * I första hand används det network_number som 
     * innehåller "(LIBRIS)" eller "(SE-LIBR)". Detta motsvarar "Bib ID" i Libris
     * 
     * I andra hand används det network_number som
     * innehåller "(LIBRISIII)". Detta motsvarar då "ONR" i Libris(det gamla bib-id:t)
     * 
     * I tredje hand används det network_number som
     * inte har någon parentes, då anses det också vara ett "ONR"
     * 
     * @param network_number 
     */
    getLibrisType(network_number) {
        let currentlibrisid: string = "";
        let librisidtype: string = "";
    
        for (let k = 0; k < network_number.length; k++) {
          if(network_number[k].indexOf('(LIBRIS)') !== -1 ) {
            currentlibrisid = network_number[k].substr(8, network_number[k].length);
            librisidtype = 'bibid'
            break;
          }

          if(network_number[k].indexOf('(SE-LIBR)') !== -1 ) {
            currentlibrisid = network_number[k].substr(9, network_number[k].length);
            librisidtype = 'bibid'
            break;
          }
        }
        //Inget bibid hittades
        //Finns libris3? "(LIBRISIII)"
        if (currentlibrisid == "") {
          for (let k = 0; k < network_number.length; k++) {
            if(network_number[k].indexOf('(LIBRISIII)') !== -1 ) {
              currentlibrisid = network_number[k].substr(11, network_number[k].length);
              librisidtype = 'libris3'
              break;
            }
          }
        }
    
        if (currentlibrisid == "") {
          //Finns ett värde som saknar "("? Då anses det vara ett "libris3" id
          for (let k = 0; k < network_number.length; k++) {
              if(network_number[k].indexOf('(') === -1 ) {
                currentlibrisid = network_number[k]
                librisidtype = 'libris3'
                  break;
              }	
          }
        }
        return [currentlibrisid, librisidtype]
    }

     /**
      * 
      * Funktion för att hämta detaljer för en holdingspost i Libris
      * och spara dessa till ett librisitem som sedan visas i appen.
      * 
      * Matchning sker på konfigurerade Sigel
      * 
      * Bestånd hittas i librisobject.items[index]['@reverse'].itemOf
      * Sigel hittas i librisobject.items[index]['@reverse'].itemOf[index].heldBy['@id']
      * 
      * @param librisobject 
      * @param bib 
      * @param index 
      * @param sigelarray 
      */
    async getLibrisItem(librisobject, librisid, bib, sigels) {
        let title: string = ""
        let librisinstance: boolean = false;
        let instanceid: string = "";
        const instancetypes = ['Instance', 'Electronic', 'Print', 'TextInstance', 'PhysicalResource', 'Item'];
        let librisinstancelink: string = "#"
        let librisholdings: any;
        let errormessage: string;
        let holdingsindex: number;
        let lastslash: string = ""
        let sigelmatch: boolean = false
        let librisresult: any;
        let librisholdingslink: string;
        let librisitem: any;

        if(bib.title) {
            title = bib.title;
        }
        if(bib.author) {
            title += " " + bib.author;
        }
        for (let i = 0; i < librisobject.items.length; i++) {
            if((librisobject.items[i]['@type'] == 'Instance' 
                || librisobject.items[i]['@type'] == 'Electronic'
                || librisobject.items[i]['@type'] == 'Print'
                || librisobject.items[i]['@type'] == 'TextInstance'
                || librisobject.items[i]['@type'] == 'PhysicalResource'
                || librisobject.items[i]['@type'] == 'Item' )
                && typeof librisobject.items[i]['@reverse'] !== 'undefined') {
                librisinstance = true; 
                instanceid = librisobject.items[i]['@id'];
                lastslash = librisobject.items[i]['@id'].lastIndexOf("/");
                librisinstancelink = librisobject.items[i]['@id'].substring(0,lastslash)+"/katalogisering" + librisobject.items[i]['@id'].substring(lastslash);
                
                sigelmatch = false
                librisholdings=[]
                holdingsindex = 0;
                for (let j = 0; j < librisobject.items[i]['@reverse'].itemOf.length; j++) {
                    if(librisobject.items[i]['@reverse'].itemOf[j].heldBy) {
                        //Är aktuell heldby = något av konfigurerade Sigels?
                        if(sigels.some(
                            row => {
                                return row.sigel == librisobject.items[i]['@reverse'].itemOf[j].heldBy['@id'].substring(librisobject.items[i]['@reverse'].itemOf[j].heldBy['@id'].lastIndexOf("/") + 1)
                                }
                        )) {
                            sigelmatch = true;

                            const httpOptions = {
                                headers: new HttpHeaders({
                                    'Accept':  'application/json+ld',
                                })
                            };

                            const holdingurl = librisobject.items[i]['@reverse'].itemOf[j]['@id'].replace('#it','')
                            const holdingresponse = await this.http.get<any>(
                                holdingurl + '/data.jsonld?embellished=false', { ...httpOptions, observe: 'response' })
                                .toPromise()
                            librisresult = holdingresponse.body

                            librisholdings[holdingsindex] = {}
                            //Rådata som behövs för att kunna uppdatera/ta bort beståndet i Libris
                            librisholdings[holdingsindex].holdingurl = holdingurl
                            librisholdings[holdingsindex].etag = holdingresponse.headers.get('ETag')
                            librisholdings[holdingsindex].holdinggraph = JSON.parse(JSON.stringify(librisresult))

                            librisresult.mainEntity = librisresult['@graph'][1]
                            lastslash = librisobject.items[i]['@reverse'].itemOf[j].heldBy['@id'].lastIndexOf("/")
                            
                            //Sigel
                            librisholdings[holdingsindex].sigel= librisobject.items[i]['@reverse'].itemOf[j].heldBy['@id'].substring(lastslash+1)
                            
                            lastslash = librisresult.mainEntity['@id'].lastIndexOf("/");
                            librisholdingslink = librisresult.mainEntity['@id'].substring(0,lastslash)+"/katalogisering" + librisresult.mainEntity['@id'].substring(lastslash);
                            
                            //Länk till post i Libris katalogisering
                            librisholdings[holdingsindex].link = librisholdingslink

                            //Skapa ett 852-fält
                            librisholdings[holdingsindex].marc_852 = []
                            let tempstring = "";

                            //Det finns två olika typer i Libris
                            //Antingen "hasComponent" där det finns flera items på samma holding.
                            if (librisresult.mainEntity.hasComponent) {
                                for (let k = 0; k < librisresult.mainEntity.hasComponent.length; k++) {
                                    
                                    librisholdings[holdingsindex].marc_852[k] = {}

                                    //852 #8 LÄNK- OCH SEKVENSNUMMER
                                    librisholdings[holdingsindex].marc_852[k]["8"] = "";
                                    if (librisresult.mainEntity["marc:groupid"]) {
                                        librisholdings[holdingsindex].marc_852[k]["8"] = librisresult.mainEntity["marc:groupid"]
                                    }

                                    //852 #b SIGEL
                                    librisholdings[holdingsindex].marc_852[k].b = librisholdings[holdingsindex].sigel

                                    //852 #c SAMLING
                                    librisholdings[holdingsindex].marc_852[k].c = "";
                                    if (librisresult.mainEntity.hasComponent[k].physicalLocation) {
                                        for (let l = 0; l < librisresult.mainEntity.hasComponent[k].physicalLocation.length; l++) {
                                            tempstring += librisresult.mainEntity.hasComponent[k].physicalLocation[l] + " ";
                                        }
                                        librisholdings[holdingsindex].marc_852[k].c = tempstring;
                                    }
                                    //852 #h HYLLKOD
                                    librisholdings[holdingsindex].marc_852[k].h = "";
                                    if (librisresult.mainEntity.hasComponent[k].shelfMark) {
                                        tempstring = "";

                                        if (Array.isArray(librisresult.mainEntity.hasComponent[k].shelfMark)) {
                                            for (let l = 0; l < librisresult.mainEntity.hasComponent[k].shelfMark.length; l++) {
                                                if (Array.isArray(librisresult.mainEntity.hasComponent[k].shelfMark[l].label)) {
                                                    tempstring += librisresult.mainEntity.hasComponent[k].shelfMark[l].label[0];
                                                } else {
                                                    tempstring += librisresult.mainEntity.hasComponent[k].shelfMark[l].label;
                                                }
                                            }
                                            librisholdings[holdingsindex].marc_852[k].h = tempstring;
                                        } else {
                                            if (Array.isArray(librisresult.mainEntity.hasComponent[k].shelfMark.label)) {
                                                librisholdings[holdingsindex].marc_852[k].h = librisresult.mainEntity.hasComponent[k].shelfMark.label[0];
                                            } else {
                                                librisholdings[holdingsindex].marc_852[k].h = librisresult.mainEntity.hasComponent[k].shelfMark.label;
                                            }
                                        }
                                    }
                                    //852 #j LÖPNUMMER
                                    librisholdings[holdingsindex].marc_852[k].j = "";
                                    if (librisresult.mainEntity.hasComponent[k].shelfControlNumber) {
                                        librisholdings[holdingsindex].marc_852[k].j = librisresult.mainEntity.hasComponent[k].shelfControlNumber;
                                    }
                                    //852 #l UPPSTÄLLNINGSORD
                                    librisholdings[holdingsindex].marc_852[k].l = "";
                                    if (librisresult.mainEntity.hasComponent[k].shelfLabel) {
                                        librisholdings[holdingsindex].marc_852[k].l = librisresult.mainEntity.hasComponent[k].shelfLabel;
                                    }
                                    //852 #t EXEMPLARNUMMER
                                    librisholdings[holdingsindex].marc_852[k].t = "";
                                    if (librisresult.mainEntity.hasComponent[k].copyNumber) {
                                        librisholdings[holdingsindex].marc_852[k].t = librisresult.mainEntity.hasComponent[k].copyNumber;
                                    }
                                    //852 #i EXEMPLARSTATUS
                                    librisholdings[holdingsindex].marc_852[k].i = "";
                                    if (librisresult.mainEntity.hasComponent[k].availability) {
                                        librisholdings[holdingsindex].marc_852[k].i = librisresult.mainEntity.hasComponent[k].availability[0].label;
                                    }

                                    // 852 otherinfo
                                    librisholdings[holdingsindex].marc_852[k].otherinfo = "";
                                    
                                    if (librisresult.mainEntity.hasComponent[k]["marc:hasTextualHoldingsBasicBibliographicUnit"]) {
                                        for (let l = 0; l < librisresult.mainEntity.hasComponent[k]["marc:hasTextualHoldingsBasicBibliographicUnit"].length; l++) {
                                            if (librisresult.mainEntity.hasComponent[k]["marc:hasTextualHoldingsBasicBibliographicUnit"][l]["marc:publicNote"]) {
                                                librisholdings[holdingsindex].marc_852[k].otherinfo += librisresult.mainEntity.hasComponent[k]["marc:hasTextualHoldingsBasicBibliographicUnit"][l]["marc:publicNote"][0] + " | ";
                                            }
                                            if (librisresult.mainEntity.hasComponent[k]["marc:hasTextualHoldingsBasicBibliographicUnit"][l]["marc:textualString"]) {
                                                librisholdings[holdingsindex].marc_852[k].otherinfo += librisresult.mainEntity.hasComponent[k]["marc:hasTextualHoldingsBasicBibliographicUnit"][l]["marc:textualString"] + " | ";
                                            }
                                        }
                                    }
                                }
                            } else {
                            //Eller poster med endast ett item per holding.
                                tempstring = "";
                                librisholdings[holdingsindex].marc_852[0] = {}

                                //852 #8 LÄNK- OCH SEKVENSNUMMER
                                librisholdings[holdingsindex].marc_852[0]["8"] = "";
                                if (librisresult.mainEntity["marc:groupid"]) {
                                    librisholdings[holdingsindex].marc_852[0]["8"] = librisresult.mainEntity["marc:groupid"]
                                }

                                //852 #b SIGEL
                                librisholdings[holdingsindex].marc_852[0].b = librisholdings[holdingsindex].sigel

                                //852 #c SAMLING
                                librisholdings[holdingsindex].marc_852[0].c = "";
                                if (librisresult.mainEntity.physicalLocation) {
                                    for (let l = 0; l < librisresult.mainEntity.physicalLocation.length; l++) {
                                        tempstring += librisresult.mainEntity.physicalLocation[l] + " ";
                                    }
                                    librisholdings[holdingsindex].marc_852[0].c = tempstring;
                                }
                                //852 #h HYLLKOD
                                librisholdings[holdingsindex].marc_852[0].h = "";
                                if (librisresult.mainEntity.shelfMark) {
                                    tempstring = ""
                                    
                                    if (Array.isArray(librisresult.mainEntity.shelfMark)) {
                                        for (let l = 0; l < librisresult.mainEntity.shelfMark.length; l++) {
                                            if (Array.isArray(librisresult.mainEntity.shelfMark[l].label)) {
                                                tempstring += librisresult.mainEntity.shelfMark[l].label[0] + " ";
                                            } else {
                                                tempstring += librisresult.mainEntity.shelfMark[l].label + " ";
                                            } 
                                        }
                                        librisholdings[holdingsindex].marc_852[0].h = tempstring;
                                    } else {
                                        if (Array.isArray(librisresult.mainEntity.shelfMark.label)) {
                                            librisholdings[holdingsindex].marc_852[0].h = librisresult.mainEntity.shelfMark.label[0] + " ";
                                        } else {
                                            librisholdings[holdingsindex].marc_852[0].h = librisresult.mainEntity.shelfMark.label + " ";
                                        }
                                    }
                                }
                                //852 #j LÖPNUMMER
                                librisholdings[holdingsindex].marc_852[0].j = "";
                                if (librisresult.mainEntity.shelfControlNumber) {
                                    librisholdings[holdingsindex].marc_852[0].j = librisresult.mainEntity.shelfControlNumber;
                                }
                                //852 #l UPPSTÄLLNINGSORD
                                librisholdings[holdingsindex].marc_852[0].l = "";
                                if (librisresult.mainEntity.shelfLabel) {
                                    librisholdings[holdingsindex].marc_852[0].l = librisresult.mainEntity.shelfLabel;
                                }
                                //852 #t EXEMPLARNUMMER
                                librisholdings[holdingsindex].marc_852[0].t = "";
                                if (librisresult.mainEntity.copyNumber) {
                                    librisholdings[holdingsindex].marc_852[0].t = librisresult.mainEntity.copyNumber;
                                }
                                //852 #i EXEMPLARSTATUS
                                librisholdings[holdingsindex].marc_852[0].i = "";
                                if (librisresult.mainEntity.availability) {
                                    librisholdings[holdingsindex].marc_852[0].i = librisresult.mainEntity.availability[0].label;
                                }
                            }

                            tempstring = ""
                            //Hämta in övriga intressant informationsfält.
                            if (librisresult.mainEntity["marc:hasTextualHoldingsBasicBibliographicUnit"]) {
                                for (let l = 0; l < librisresult.mainEntity["marc:hasTextualHoldingsBasicBibliographicUnit"].length; l++) {
                                    if (librisresult.mainEntity["marc:hasTextualHoldingsBasicBibliographicUnit"][l]["marc:publicNote"]) {
                                        tempstring += librisresult.mainEntity["marc:hasTextualHoldingsBasicBibliographicUnit"][l]["marc:publicNote"][0] + " | ";
                                    }
                                    if (librisresult.mainEntity["marc:hasTextualHoldingsBasicBibliographicUnit"][l]["marc:textualString"]) {
                                        tempstring += librisresult.mainEntity["marc:hasTextualHoldingsBasicBibliographicUnit"][l]["marc:textualString"] + " | ";
                                    }
                                }
                            }
                            librisholdings[holdingsindex].otherinfo = tempstring;

                            holdingsindex++
                        }
                    }
                }
                            
                if (!sigelmatch) {
                    librisholdings=[];
                    errormessage = this.translate.instant('Translate.noholdingsfound');
                }
                break;
            }
        }

        //Instans utan några bestånd alls (saknar @reverse) är också en träff, men utan bestånd
        if (!librisinstance) {
            //'Item' är en beståndspost (kan finnas i träfflistan om den delar kontrollnummer), aldrig en instans
            const bare = librisobject.items.find(item => item['@type'] !== 'Item' && instancetypes.includes(item['@type']) && item['@id']);
            if (bare) {
                librisinstance = true;
                instanceid = bare['@id'];
                const slash = instanceid.lastIndexOf("/");
                librisinstancelink = instanceid.substring(0, slash) + "/katalogisering" + instanceid.substring(slash);
                librisholdings = [];
                errormessage = this.translate.instant('Translate.noholdingsfound');
            }
        }

        if (!librisinstance) {
            librisholdings=[];
            errormessage = this.translate.instant('Translate.notitlefound');
        }

        librisholdings = this.sort_by_key(librisholdings,"sigel")
        librisitem = { 
            "title": title,
            "librisid": librisid,
            "librisinstance": librisinstance,
            "librisinstancelink": librisinstancelink,
            "instanceid": instanceid,
            "librisholdings": librisholdings,
            "errormessage": errormessage
        }
        return librisitem
    }

    /**
     * Fälten i 852 som kan ändras i Libris
     */
    editableFields = ['c', 'h', 'j', 'l', 't', 'i'];

    /**
     * Jämför ursprungliga och redigerade 852-fält och returnerar de ändringar som gjorts
     * (används både för förhandsvisning och för att veta vilka fält som ska skrivas till Libris)
     */
    diffHolding(original: any[], edited: any[]) {
        const changes = [];
        for (let k = 0; k < original.length; k++) {
            for (const field of this.editableFields) {
                const before = String(original[k][field] ?? '').trim();
                const after = String(edited[k][field] ?? '').trim();
                if (before !== after) {
                    changes.push({ index: k, field: field, before: before, after: after });
                }
            }
        }
        return changes;
    }

    private setField(target: any, field: string, value: string) {
        const keepOrDelete = (prop: string, newvalue: any) => {
            if (value === '') { delete target[prop]; } else { target[prop] = newvalue; }
        };
        switch (field) {
            case 'c':
                keepOrDelete('physicalLocation', [value]);
                break;
            case 'h': {
                const existing = Array.isArray(target.shelfMark) ? target.shelfMark[0] : target.shelfMark;
                //Behåll befintlig form på label (lista/sträng). Ny hyllkod får sträng.
                const labelIsArray = !!existing && Array.isArray(existing.label);
                const shelfmark = { ...(existing || { '@type': 'ShelfMarkSequence' }), label: labelIsArray ? [value] : value };
                keepOrDelete('shelfMark', Array.isArray(target.shelfMark) ? [shelfmark] : shelfmark);
                break;
            }
            case 'j':
                keepOrDelete('shelfControlNumber', value);
                break;
            case 'l':
                keepOrDelete('shelfLabel', value);
                break;
            case 't':
                keepOrDelete('copyNumber', value);
                break;
            case 'i': {
                const availability = Array.isArray(target.availability) ? target.availability : [];
                const existing = availability[0] || {};
                availability[0] = { ...existing, label: Array.isArray(existing.label) ? [value] : value };
                keepOrDelete('availability', availability);
                break;
            }
        }
    }

    /**
     * Skapar en ny JSON-LD-graf för ett bestånd där enbart ändrade fält har skrivits om.
     * Samma uppdelning som vid läsning: "hasComponent" (flera exemplar) eller beståndet självt.
     */
    applyHoldingChanges(graph: any, changes: any[]) {
        const updated = JSON.parse(JSON.stringify(graph));
        const mainEntity = updated['@graph'][1];
        for (const change of changes) {
            const target = mainEntity.hasComponent ? mainEntity.hasComponent[change.index] : mainEntity;
            this.setField(target, change.field, change.after);
        }
        return updated;
    }

    /**
     * Skapar en ny JSON-LD-graf där ett enskilt exemplar (hasComponent[index]) tagits bort
     */
    removeHoldingComponent(graph: any, index: number) {
        const updated = JSON.parse(JSON.stringify(graph));
        updated['@graph'][1].hasComponent.splice(index, 1);
        return updated;
    }

    /**
     * Bygger grafen för ett helt nytt bestånd (Record + Item) kopplat till instansen
     */
    buildNewHolding(instanceid: string, sigel: string, values: any) {
        const tempid = 'https://id.kb.se/TEMPID';
        const item: any = {
            '@id': tempid + '#it',
            '@type': 'Item',
            heldBy: { '@id': 'https://libris.kb.se/library/' + sigel },
            itemOf: { '@id': instanceid }
        };
        for (const field of this.editableFields) {
            const value = String(values[field] ?? '').trim();
            if (value !== '') {
                this.setField(item, field, value);
            }
        }
        return {
            '@graph': [
                { '@id': tempid, '@type': 'Record', mainEntity: { '@id': tempid + '#it' } },
                item
            ]
        };
    }

    /**
     * Skickar en graf till Libris via proxy (POST /data) och returnerar svaret
     */
    private async postGraph(graph: any, sigel: string, proxyUrl: string, authToken: string) {
        const headers = new HttpHeaders({
            'Authorization': 'Bearer ' + authToken,
            'Accept': 'application/ld+json',
            'Content-Type': 'application/ld+json',
            'XL-Active-Sigel': sigel,
        });
        return this.http.post<any>(
            proxyUrl.replace(/\/+$/, ''), graph, { headers: headers, observe: 'response' }
        ).toPromise();
    }

    /**
     * Bygger en ny beståndspost av en tidigare (borttagen) graf: innehållet behålls men post-id:n byts mot ett
     * temporärt id och referenser till den gamla posten (sameAs) tas bort. Libris ger posten ett nytt id.
     */
    buildRestoredHolding(oldGraph: any) {
        const tempid = 'https://id.kb.se/TEMPID';
        const item = JSON.parse(JSON.stringify(oldGraph['@graph'][1]));
        item['@id'] = tempid + '#it';
        delete item.sameAs;
        return {
            '@graph': [
                { '@id': tempid, '@type': 'Record', mainEntity: { '@id': tempid + '#it' } },
                item
            ]
        };
    }

    /**
     * Återskapar ett borttaget bestånd i Libris (nytt id). Returnerar adressen till det nya beståndet.
     */
    async restoreLibrisHolding(oldGraph: any, sigel: string, proxyUrl: string, authToken: string): Promise<string> {
        const graph = this.buildRestoredHolding(oldGraph);
        const response = await this.postGraph(graph, sigel, proxyUrl, authToken);
        return response.headers.get('Location');
    }

    /**
     * Lägger tillbaka en borttagen rad (komponent) i ett bestånd som finns kvar i Libris.
     */
    async restoreLibrisRow(holdingurl: string, sigel: string, component: any, index: number, proxyUrl: string, authToken: string) {
        const current = await this.http.get<any>(
            holdingurl.replace(/#.*$/, '') + '/data.jsonld?embellished=false',
            { headers: new HttpHeaders({ 'Accept': 'application/json+ld' }), observe: 'response' }
        ).toPromise();
        const graph = current.body;
        const mainEntity = graph['@graph'][1];
        if (!Array.isArray(mainEntity.hasComponent)) {
            throw new Error('Beståndet har ingen radlista, raden kan inte läggas tillbaka automatiskt');
        }
        mainEntity.hasComponent.splice(Math.min(index, mainEntity.hasComponent.length), 0, component);
        const holding = { holdingurl: holdingurl.replace(/#.*$/, ''), etag: current.headers.get('ETag'), sigel: sigel };
        return this.updateLibrisHolding(holding, graph, proxyUrl, authToken);
    }

    /**
     * Skapar ett nytt bestånd i Libris via proxy (POST) och läser sedan in det nya beståndet.
     * Returnerar ett holding-objekt i samma form som getLibrisItem.
     */
    async createLibrisHolding(instanceid: string, sigel: string, values: any, proxyUrl: string, authToken: string) {
        const graph = this.buildNewHolding(instanceid, sigel, values);
        const response = await this.postGraph(graph, sigel, proxyUrl, authToken);

        const location = response.headers.get('Location');
        if (!location) {
            throw new Error('Libris returned no Location');
        }
        const holdingurl = location.replace(/#.*$/, '').replace(/\/+$/, '');

        //Läs in det nya beståndet (för graf och etag)
        const created = await this.http.get<any>(
            holdingurl + '/data.jsonld?embellished=false',
            { headers: new HttpHeaders({ 'Accept': 'application/json+ld' }), observe: 'response' }
        ).toPromise();
        const mainEntity = created.body['@graph'][1];
        const lastslash = mainEntity['@id'].lastIndexOf('/');
        const row: any = { '8': '', b: sigel };
        for (const field of this.editableFields) {
            row[field] = String(values[field] ?? '').trim();
        }
        row.otherinfo = '';
        return {
            sigel: sigel,
            link: mainEntity['@id'].substring(0, lastslash) + '/katalogisering' + mainEntity['@id'].substring(lastslash),
            holdingurl: holdingurl,
            etag: created.headers.get('ETag'),
            holdinggraph: created.body,
            marc_852: [row],
            otherinfo: ''
        };
    }

    /**
     * Letar upp formen på första befintliga shelfMark bland komponenterna
     */
    private findShelfMarkTemplate(components: any[]) {
        for (const component of components) {
            if (!component.shelfMark) continue;
            const isArray = Array.isArray(component.shelfMark);
            const shelfmark = isArray ? component.shelfMark[0] : component.shelfMark;
            if (shelfmark && shelfmark['@type']) {
                return { type: shelfmark['@type'], labelIsArray: Array.isArray(shelfmark.label), isArray: isArray };
            }
        }
        return null;
    }

    /**
     * Skapar en ny JSON-LD-graf där ett nytt exemplar (hasComponent) lagts till.
     * Har beståndet inga "hasComponent" flyttas den befintliga raden (fälten ligger då direkt på beståndet)
     * till en egen komponent, tillsammans med den nya. En helt tom befintlig rad tas inte med.
     */
    addHoldingComponent(graph: any, values: any) {
        const updated = JSON.parse(JSON.stringify(graph));
        const mainEntity = updated['@graph'][1];
        let replacedEmpty = false;

        if (!mainEntity.hasComponent) {
            const rowfields = ['physicalLocation', 'shelfMark', 'shelfControlNumber', 'shelfLabel', 'copyNumber', 'availability'];
            const oldrow: any = { '@type': 'Item', heldBy: mainEntity.heldBy };
            let hasContent = false;
            for (const f of rowfields) {
                if (mainEntity[f] !== undefined) {
                    oldrow[f] = mainEntity[f];
                    delete mainEntity[f];
                    hasContent = true;
                }
            }
            mainEntity.hasComponent = hasContent ? [oldrow] : [];
            replacedEmpty = !hasContent;
        }

        const newrow: any = { '@type': 'Item', heldBy: mainEntity.heldBy };
        //Hyllkod (h) ska ha samma form som beståndets övriga rader (typ, sträng/lista)
        const shelfmarktemplate = this.findShelfMarkTemplate(mainEntity.hasComponent);
        for (const field of this.editableFields) {
            const value = String(values[field] ?? '').trim();
            if (value === '') continue;
            if (field === 'h' && shelfmarktemplate) {
                const shelfmark = {
                    '@type': shelfmarktemplate.type,
                    label: shelfmarktemplate.labelIsArray ? [value] : value
                };
                newrow.shelfMark = shelfmarktemplate.isArray ? [shelfmark] : shelfmark;
            } else {
                this.setField(newrow, field, value);
            }
        }
        mainEntity.hasComponent.push(newrow);
        return { graph: updated, replacedEmpty: replacedEmpty };
    }

    /**
     * URL till beståndet via proxyn (samma sökväg som i Libris)
     */
    private holdingProxyUrl(holding: any, proxyUrl: string) {
        return proxyUrl.replace(/\/+$/, '') + new URL(holding.holdingurl).pathname;
    }

    private writeHeaders(holding: any, authToken: string, contentType?: string) {
        // Alma-token identifierar användaren mot proxyn, som själv lägger på Libris-token
        let headers = new HttpHeaders({
            'Authorization': 'Bearer ' + authToken,
            'Accept': 'application/ld+json',
            'XL-Active-Sigel': holding.sigel,
        });
        if (contentType) {
            headers = headers.set('Content-Type', contentType);
        }
        if (holding.etag) {
            headers = headers.set('If-Match', holding.etag);
        }
        return headers;
    }

    /**
     * Skriver ett uppdaterat bestånd till Libris via proxy (PUT).
     * Returnerar ny graf och ny etag.
     */
    async updateLibrisHolding(holding: any, graph: any, proxyUrl: string, authToken: string) {
        const response = await this.http.put<any>(
            this.holdingProxyUrl(holding, proxyUrl), graph,
            { headers: this.writeHeaders(holding, authToken, 'application/ld+json'), observe: 'response' }
        ).toPromise();
        return { graph: graph, etag: response.headers.get('ETag') };
    }

    /**
     * Tar bort ett bestånd i Libris via proxy (DELETE).
     */
    async deleteLibrisHolding(holding: any, proxyUrl: string, authToken: string) {
        return this.http.delete<any>(
            this.holdingProxyUrl(holding, proxyUrl),
            { headers: this.writeHeaders(holding, authToken) }
        ).toPromise();
    }
}
