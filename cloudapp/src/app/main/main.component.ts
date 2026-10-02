import { Subscription, throwError } from 'rxjs';
import { AlertService } from '@exlibris/exl-cloudapp-angular-lib';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { 
  CloudAppConfigService, 
  CloudAppRestService, 
  CloudAppEventsService, 
  Entity 
} from '@exlibris/exl-cloudapp-angular-lib';
import { TranslateService } from '@ngx-translate/core';
import { AppService } from '../app.service';
import { map, catchError } from 'rxjs/operators';
import { LibrisService } from '../libris.service';
import { LibrisItem } from '../models/librisitem';
import { HoldingDialogComponent } from './holding-dialog/holding-dialog.component';

@Component({
  selector: 'app-main',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.scss']
})

export class MainComponent implements OnInit, OnDestroy {

  private subscription$: Subscription;
  private pageLoad$: Subscription;

  app_error: boolean = false;
  app_errormessage: string;

  entities: Entity[];
  selectedEntity: Entity;
  pageitems: any;
  hasAlmaApiResult: boolean = false;
  
  config: any;
  configmissing: boolean = false;

  sigels: any;
  authToken: string;

  numberofAlmaItems: any;
  nrofEntetiesProcessed: any;

  hasLibrisResult: boolean;

  constructor(
    private configService: CloudAppConfigService,
    private restService: CloudAppRestService,
    private eventsService: CloudAppEventsService,
    private appService: AppService,
    private translate: TranslateService,
    private alert: AlertService,
    private librisservice: LibrisService,
    private dialog: MatDialog
    ) { } 

  ngOnInit() {
    //Hämta en token för eventuella anrop.
    this.eventsService
    .getAuthToken()
    .subscribe(authToken => this.authToken = authToken);

    //Hämta aktuell konfiguration
    this.configService
    .get()
    .pipe(
      map(conf=>{
        if (!conf.librisUrl || !conf.LibrisSigelTemplate) {
          this.configmissing = true
          this.alert.error(this.translate.instant('Translate.noconfiginfo'))
        } else {
          this.config = conf;
          this.sigels = this.config.LibrisSigelTemplate;
          this.pageLoad()
        }
      })
    ).subscribe()
  }

  /**
   * Funktion som i huvudsak hämtar bib-information från Alma
   * utifrån de poster som visas på aktuell sids i Alma
   * 
   * För varje post hämtas sedan holdings ifrån Libris
   * och dessa holdings visas i appen.
   * 
   */
  
  
  
  
  
  
  
  
  
  
  pageLoad() {
    this.pageLoad$ = this.eventsService.onPageLoad(async pageInfo => { 
      this.hasAlmaApiResult = false;
      this.hasLibrisResult = false;
      this.app_error = false;
      this.app_errormessage = "";

      if(this.subscription$) {
        this.subscription$.unsubscribe();
      }

      const incoming = pageInfo.entities || [];
      if (incoming.length === 0) return;

      const isBookClick = this.entities && 
                        this.entities.length > 0 && 
                        this.entities.some(e => e.id === incoming[0].id);

      //Hämta bara ny om det inte är klick på en post.
      if (!isBookClick) {
          this.entities = [...incoming];
      }
      this.selectedEntity = incoming[0]; 
      
      //Kör bara om poster som visas i Alma är items eller bibs eller holdings
      if ( this.entities.length > 0 && (this.entities[0].type == "BIB_MMS" || this.entities[0].type == "ITEM" || this.entities[0].type == "HOLDING")) {      
  
        this.hasAlmaApiResult = true;
        this.nrofEntetiesProcessed = 0;  

        this.pageitems = [];

        this.numberofAlmaItems = this.entities.length;

        //Gå igenom alla poster på aktuell sida.
        this.entities.map((e, index) => {
          this.pageitems[index] = [];
          let sigeltolibris: any;
          //Hämta ytterligare almainformation
          //Skapa rätt länk
          
          let almaurl = "";
          if (e.type == "HOLDING"){
            almaurl = e.link.split('/holdings')[0]
          } else {
            almaurl = e.link
          }
          
          this.restService
            .call(almaurl)
            .pipe(
              map(async (item) => {
                let librisarr: any;
                let bib: any;
                //Item-poster
                if (e.type == "ITEM") {
                  bib = item.bib_data;
                  //Hitta vilken typ av libris-id som är aktuellt
                  if (item.bib_data.network_number) {
                    librisarr = this.librisservice.getLibrisType(
                      item.bib_data.network_number
                    );
                  }

                  this.pageitems[index].almaholdingslink = item.holding_data.link;
                  this.pageitems[index].mms_id = item.bib_data.mms_id;
                  this.pageitems[index].holding_id = item.holding_data.holding_id;
                    
                  //Om posten är av typ ITEM = specifik post => sigel som skickas till getlibrisitem = endast aktuellt
                  sigeltolibris = [this.sigels.find(({almalibrarycode}) => almalibrarycode === item.item_data.library.value)];
                  //Om det är en post som har location "Main Library: Staff, Acquisitions department"
                  //Sök på alla sigel i Libris
                  if (item.item_data.location.value == "hbkla") {
                    sigeltolibris = this.sigels;
                  }
                  
                }

                //BIB-poster
                if (e.type == "BIB_MMS" || e.type == "HOLDING") {
                  bib = item;
                  if (item.network_number) {
                    librisarr = this.librisservice.getLibrisType(
                      item.network_number
                    );
                  }

                  //Om posten är av typen BIB_MMS = generell bib post => sigel som skickas till getlibrisitem = samtliga
                  sigeltolibris = this.sigels;
                }

                //Om det finns en koppling till Libris
                if (librisarr && typeof librisarr[0] !== "undefined" && librisarr[0] !== "") {
                  //hämta librisinstans utirån 035-id
                  try {
                    let lib = await this.librisservice
                      .getLibrisInstance(
                        librisarr[0], //id
                        librisarr[1], //type (bibid, libris3)
                        this.config.librisUrl
                      )
                      .toPromise();
                    this.pageitems[index].librisinstance = lib;
                    //Vilka sigel som sökts (för att veta var nya bestånd får läggas till)
                    this.pageitems[index].searchedsigels = (sigeltolibris || []).filter(s => s);
                    //hämta librisitem utifrån librisid (från instans)
                    let librisitem = await this.librisservice.getLibrisItem(
                      lib, //librisinstansen
                      librisarr[0], //för att visa librisid
                      bib, //för att visa title + author
                      sigeltolibris
                    );
                    this.pageitems[index].librisitem = librisitem;
                  } catch (error) {
                    //Eventuella fel
                    this.pageitems[index].librisitem = {
                      index: index,
                      title: bib.title,
                      librisid: "",
                      librisinstance: null,
                      librisinstancelink: "",
                      librisholdings: {},
                      errormessage: error.message,
                    };
                  }
                } else {
                  //Posten har inget network number som matchar godkända librisid/typer
                  this.pageitems[index].librisitem = {
                    index: index,
                    title: bib.title,
                    librisid: "",
                    librisinstance: false,
                    librisinstancelink: "#",
                    librisholdings: [],
                    errormessage: this.translate.instant(
                      "Translate.nonetworknumberfound"
                    ),
                  };
                }

                //Räkna upp hur många poster som gåtts igenom och indikera att reslutat är klart om alla poster på sidan gåtts igenom
                this.nrofEntetiesProcessed++;
                if (this.nrofEntetiesProcessed >= this.numberofAlmaItems) {
                  this.hasLibrisResult = true;
                }
              }),
              catchError(err => {
                //Troligen har något gått fel vid anropet till alma
                this.pageitems[index].librisitem = {
                  index: index,
                    title: "",
                    librisid: {},
                    librisinstance: false,
                    librisinstancelink: "#",
                    librisholdings: [],
                    errormessage: err.message
                }
                
                this.nrofEntetiesProcessed++;
                if (this.nrofEntetiesProcessed >= this.numberofAlmaItems) {
                  this.hasLibrisResult = true;
                }
                this.app_error = true;
                this.app_errormessage = 'Error: ' + err.message;
                return throwError(err);
              })
            )
            .subscribe();
        });
      }
    });
  }

  ngOnDestroy(): void {
    if(this.pageLoad$) {
      this.pageLoad$.unsubscribe();
    }
    if(this.subscription$) {
      this.subscription$.unsubscribe();
    }
  }

  /**
   * Öppnar dialog för att redigera ett bestånd i Libris
   * och uppdaterar visningen när det sparats.
   */
  editHolding(pageitem: any, holding: any, libraryname: string, rowIndex?: number) {
    this.dialog
      .open(HoldingDialogComponent, {
        width: '400px',
        data: { mode: 'edit', holding: holding, rowIndex: rowIndex, proxyUrl: this.config.proxyUrl, authToken: this.authToken, libraryname: libraryname }
      })
      .afterClosed()
      .subscribe(result => {
        if (result) {
          //Enskild rad (result.marc_852 har då bara den raden) eller alla rader i beståndet
          const first = result.rowIndex !== undefined ? result.rowIndex : 0;
          const last = result.rowIndex !== undefined ? result.rowIndex : holding.marc_852.length - 1;
          for (let k = first; k <= last; k++) {
            const edited = result.marc_852[k - first];
            this.librisservice.editableFields.forEach(f => holding.marc_852[k][f] = String(edited[f] ?? '').trim());
          }
          holding.holdinggraph = result.graph;
          holding.etag = result.etag;
          this.alert.success(this.translate.instant('Translate.holding_saved'));
        }
      });
  }

  /**
   * Konfigurerade sigel som sökts på posten men som saknar bestånd, dvs där ett nytt bestånd kan skapas
   */
  getCreateOptions(pageitem: any) {
    const existing = (pageitem.librisitem.librisholdings || []).map(h => h.sigel);
    return (pageitem.searchedsigels || []).filter(s => !existing.includes(s.sigel));
  }

  /**
   * Öppnar dialog för att skapa ett helt nytt bestånd (för ett bibliotek utan bestånd) på posten
   */
  createHolding(pageitem: any) {
    this.dialog
      .open(HoldingDialogComponent, {
        width: '400px',
        data: {
          mode: 'create',
          instanceid: pageitem.librisitem.instanceid,
          sigeloptions: this.getCreateOptions(pageitem),
          proxyUrl: this.config.proxyUrl, authToken: this.authToken
        }
      })
      .afterClosed()
      .subscribe(result => {
        if (result && result.newHolding) {
          const holdings = pageitem.librisitem.librisholdings;
          holdings.push(result.newHolding);
          this.librisservice.sort_by_key(holdings, 'sigel');
          this.alert.success(this.translate.instant('Translate.holding_created'));
        }
      });
  }

  /**
   * Öppnar dialog för att lägga till ett nytt exemplar (rad) i ett bestånd
   */
  addHoldingRow(holding: any, libraryname: string) {
    this.dialog
      .open(HoldingDialogComponent, {
        width: '400px',
        data: { mode: 'add', holding: holding, proxyUrl: this.config.proxyUrl, authToken: this.authToken, libraryname: libraryname }
      })
      .afterClosed()
      .subscribe(result => {
        if (result) {
          const newRow = { '8': '', b: holding.sigel, otherinfo: '' };
          this.librisservice.editableFields.forEach(f => newRow[f] = String(result.newRow[f] ?? '').trim());
          if (result.replacedEmpty) {
            holding.marc_852 = [newRow];
          } else {
            holding.marc_852.push(newRow);
          }
          holding.holdinggraph = result.graph;
          holding.etag = result.etag;
          this.alert.success(this.translate.instant('Translate.holding_added'));
        }
      });
  }

  getLibraryName(sigel: string) {
    const found = (this.sigels || []).find(s => s.sigel == sigel);
    return found ? found.libraryname : sigel;
  }

  /**
   * Öppnar bekräftelsedialog för att ta bort ett enskilt exemplar (en rad) i ett bestånd
   */
  deleteHoldingRow(holding: any, rowIndex: number) {
    this.dialog
      .open(HoldingDialogComponent, {
        width: '400px',
        data: { mode: 'deleteRow', holding: holding, rowIndex: rowIndex, proxyUrl: this.config.proxyUrl, authToken: this.authToken, libraryname: this.getLibraryName(holding.sigel) }
      })
      .afterClosed()
      .subscribe(result => {
        if (result) {
          holding.marc_852.splice(result.removedIndex, 1);
          holding.holdinggraph = result.graph;
          holding.etag = result.etag;
          this.alert.success(this.translate.instant('Translate.holding_rowdeleted'));
        }
      });
  }

  /**
   * Öppnar bekräftelsedialog för att ta bort ett bestånd i Libris
   */
  deleteHolding(pageitem: any, holding: any, libraryname: string) {
    this.dialog
      .open(HoldingDialogComponent, {
        width: '400px',
        data: { mode: 'delete', holding: holding, proxyUrl: this.config.proxyUrl, authToken: this.authToken, libraryname: libraryname }
      })
      .afterClosed()
      .subscribe(result => {
        if (result) {
          const holdings = pageitem.librisitem.librisholdings;
          holdings.splice(holdings.indexOf(holding), 1);
          if (holdings.length == 0) {
            pageitem.librisitem.errormessage = this.translate.instant('Translate.noholdingsfound');
          }
          this.alert.success(this.translate.instant('Translate.holding_deleted'));
        }
      });
  }

  setLang(lang: string) {
    this.translate.use(lang);
  }

  substrInBetween(whole_str: string, str1: string, str2: string){
    if (whole_str.indexOf(str1) === -1 || whole_str.indexOf(str2) === -1) {
        return undefined;
   }
   return whole_str.substring(
            whole_str.indexOf(str1) + str1.length, 
            whole_str.indexOf(str2)
          );
    }

}
