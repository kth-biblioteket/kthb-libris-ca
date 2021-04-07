import { Injectable } from '@angular/core';
import { HttpClient } from "@angular/common/http";
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

    librisurl = (librisid: string, librisidtype: string, proxyURL: string) => {
        if (librisidtype == 'libris3') {
            return `${proxyURL}/find.jsonld?meta.identifiedBy.@type=LibrisIIINumber&meta.identifiedBy.value=${librisid}`;
        } else {
            return `${proxyURL}/find.jsonld?meta.controlNumber=${librisid}`;
        }
    }

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
          if(network_number[k].indexOf('(LIBRIS)') !== -1 || network_number[k].indexOf('(SE-LIBR)') !== -1 ) {
            currentlibrisid = network_number[k].substr(8, network_number[k].length);
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
    async getLibrisItem(librisobject, librisid, bib, index, sigels) {
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
        let shelves: any;
        let librisitem: any;
        if(bib.title) {
            title = bib.title;
        }
        if(bib.author) {
            title += " " + bib.author;
        }
        for (let i = 0; i < librisobject.items.length; i++) {
            if((librisobject.items[i]['@type'] == 'Instance' || librisobject.items[i]['@type'] == 'Electronic' ) && typeof librisobject.items[i]['@reverse'] !== 'undefined') {
                librisinstance = true; 
                lastslash = librisobject.items[i]['@id'].lastIndexOf("/");
                librisinstancelink = librisobject.items[i]['@id'].substring(0,lastslash)+"/katalogisering" + librisobject.items[i]['@id'].substring(lastslash);
                
                sigelmatch = false
                librisholdings=[]
                holdingsindex = 0;
                for (let j = 0; j < librisobject.items[i]['@reverse'].itemOf.length; j++) {
                    if(librisobject.items[i]['@reverse'].itemOf[j].heldBy) {
                        if(sigels.some(row => row.sigel.includes(librisobject.items[i]['@reverse'].itemOf[j].heldBy['@id'].substring(librisobject.items[i]['@reverse'].itemOf[j].heldBy['@id'].lastIndexOf("/")+1)))) {
                            sigelmatch = true;
                            librisresult = await this.http.get<any>(librisobject.items[i]['@reverse'].itemOf[j]['@id'].replace('#it','') + '/data.jsonld', {}).toPromise()
                            
                            librisholdings[holdingsindex] = {}
                            lastslash = librisobject.items[i]['@reverse'].itemOf[j].heldBy['@id'].lastIndexOf("/")
                            librisholdings[holdingsindex].sigel= librisobject.items[i]['@reverse'].itemOf[j].heldBy['@id'].substring(lastslash+1)
                            
                            lastslash = librisresult.mainEntity['@id'].lastIndexOf("/");
                            librisholdingslink = librisresult.mainEntity['@id'].substring(0,lastslash)+"/katalogisering" + librisresult.mainEntity['@id'].substring(lastslash);
                            librisholdings[holdingsindex].link = librisholdingslink
                            shelves = []

                            let tempstringarr:any
                            if (librisresult.mainEntity.hasComponent) {
                                for (let k=0;k<librisresult.mainEntity.hasComponent.length;k++) {
                                    tempstringarr = []
                                    shelves[k] = {}
                                    if (librisresult.mainEntity.hasComponent[k].physicalLocation) {
                                        tempstringarr.push(librisresult.mainEntity.hasComponent[k].physicalLocation[0])
                                    }
                                    if (librisresult.mainEntity.hasComponent[k].shelfMark) {
                                        tempstringarr.push(librisresult.mainEntity.hasComponent[k].shelfMark.label)
                                    }
                                    if (librisresult.mainEntity.hasComponent[k].shelfControlNumber) {
                                        tempstringarr.push(librisresult.mainEntity.hasComponent[k].shelfControlNumber)
                                    }
                                    if (librisresult.mainEntity.hasComponent[k].shelfLabel) {
                                        tempstringarr.push(librisresult.mainEntity.hasComponent[k].shelfLabel)
                                    }
                                    if (librisresult.mainEntity.hasComponent[k].copyNumber) {
                                        tempstringarr.push(librisresult.mainEntity.hasComponent[k].copyNumber)
                                    }
                                    if (librisresult.mainEntity.hasComponent[k].availability) {
                                        tempstringarr.push(librisresult.mainEntity.hasComponent[k].availability[0].label[0])
                                    }
                                    if(tempstringarr.length == 0) {
                                        tempstringarr.push("Saknas")
                                    }
                                    shelves[k].name = tempstringarr.join(' | ');
                                }
                            } else {
                                tempstringarr = []
                                shelves[0] = {}
                                if (librisresult.mainEntity.physicalLocation) {
                                    tempstringarr.push(librisresult.mainEntity.physicalLocation[0])
                                }
                                if (librisresult.mainEntity.shelfMark) {
                                    tempstringarr.push(librisresult.mainEntity.shelfMark.label)
                                }
                                if (librisresult.mainEntity.shelfControlNumber) {
                                    tempstringarr.push(librisresult.mainEntity.shelfControlNumber)
                                }
                                if (librisresult.mainEntity.shelfLabel) {
                                    tempstringarr.push(librisresult.mainEntity.shelfLabel)
                                }
                                if (librisresult.mainEntity.copyNumber) {
                                    tempstringarr.push(librisresult.mainEntity.copyNumber)
                                }
                                if (librisresult.mainEntity.availability) {
                                    tempstringarr.push(librisresult.mainEntity.availability[0].label[0])
                                }
                                if(tempstringarr.length == 0) {
                                    tempstringarr.push("Saknas")
                                }
                                shelves[0].name = tempstringarr.join(' | ');
                            }
                            librisholdings[holdingsindex].shelves = shelves

                            tempstringarr = []
                            if(librisresult.mainEntity["marc:hasTextualHoldingsBasicBibliographicUnit"]) {
                                for(let l=0;l<librisresult.mainEntity["marc:hasTextualHoldingsBasicBibliographicUnit"].length;l++) {
                                    if(librisresult.mainEntity["marc:hasTextualHoldingsBasicBibliographicUnit"][l]["marc:publicNote"]) {
                                        tempstringarr.push(librisresult.mainEntity["marc:hasTextualHoldingsBasicBibliographicUnit"][l]["marc:publicNote"][0]);
                                    }
                                    if(librisresult.mainEntity["marc:hasTextualHoldingsBasicBibliographicUnit"][l]["marc:textualString"]) {
                                        tempstringarr.push(librisresult.mainEntity["marc:hasTextualHoldingsBasicBibliographicUnit"][l]["marc:textualString"]);
                                    }
                                }
                            }
                            librisholdings[holdingsindex].otherinfo = tempstringarr.join(' | ');
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
            "index": index,
            "title": title,
            "librisid": librisid,
            "librisinstance": librisinstance,
            "librisinstancelink": librisinstancelink,
            "librisholdings": librisholdings,
            "errormessage": errormessage
        }
        return librisitem
    }

    getToken = (almatoken, config) => {
        console.log("running getToken function")
        console.log(config)
        const url = 'https://ref.lib.kth.se/librisproxy/librislogin/oauth/token' + `?client_id=` + config.librisClientId + `&client_secret=` + config.librisClientSecret + `&grant_type=` + 'client_credentials'
        const headers = { 'Authorization': 'Bearer ' + almatoken, "content-type":"application/x-www-form-urlencoded" };
        const body = { title: 'Angular POST Request Example' };
        this.http.post<any>(url, body, { headers }).subscribe(data => {
            console.log(data);
        });
    }
}
