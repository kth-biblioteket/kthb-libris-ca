import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from "@angular/common/http";
import { catchError } from 'rxjs/operators'; 
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
                || librisobject.items[i]['@type'] == 'TextInstance' )
                && typeof librisobject.items[i]['@reverse'] !== 'undefined') {
                librisinstance = true; 
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

                            librisresult = await this.http.get<any>(
                                librisobject.items[i]['@reverse'].itemOf[j]['@id'].replace('#it','') + '/data.jsonld?embellished=false', httpOptions)
                                .toPromise()
                            
                            librisresult.mainEntity = librisresult['@graph'][1]

                            librisholdings[holdingsindex] = {}
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
            "librisholdings": librisholdings,
            "errormessage": errormessage
        }
        return librisitem
    }
}
