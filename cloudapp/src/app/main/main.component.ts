import { Subscription, EMPTY, from } from 'rxjs';
import { AlertService } from '@exlibris/exl-cloudapp-angular-lib';
import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { 
  CloudAppConfigService, 
  CloudAppRestService, 
  CloudAppEventsService, 
  Entity 
} from '@exlibris/exl-cloudapp-angular-lib';
import { TranslateService } from '@ngx-translate/core';
import { AppService } from '../app.service';
import { map, catchError, mergeMap } from 'rxjs/operators';
import { LibrisService } from '../libris.service';
import { LibrisItem } from '../models/librisitem';
import { HoldingDialogComponent } from './holding-dialog/holding-dialog.component';
import { AlmaDeleteDialogComponent } from './alma-delete-dialog/alma-delete-dialog.component';
import { HistoryService, DeletedEntry } from '../history.service';
import { UndoDialogComponent } from './undo-dialog/undo-dialog.component';

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
  selectedId: string = null;
  private loadGeneration = 0;
  //Listan i sin ursprungliga ordning, så den kan visas rätt igen när en enskild post stängts
  private baseEntities: any[] = [];
  private pendingScrollId: string = null;

  //Senast borttagna poster (sparas per användare i Alma)
  deletedEntries: DeletedEntry[] = [];
  showHistory: boolean = false;
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
    private history: HistoryService,
    private dialog: MatDialog
    ) { } 

  ngOnInit() {
    this.history.list().then(entries => this.deletedEntries = entries);

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
      const incoming = pageInfo.entities || [];

      //När man klickar på en post i listan skickar Alma samma lista igen men med den klickade posten
      //först. Det är samma poster, så den visade listan behålls (i sin ursprungliga ordning) och laddas inte om.
      //Alma skickar ingen ny händelse när posten stängs, så listan måste redan ligga rätt.
      //Det gäller bara om appen också visar listan just nu (hasAlmaApiResult). Annars, till exempel efter en
      //tom sida (sökformuläret), måste samma lista laddas om och visas igen.
      const sameList = incoming.length > 0 &&
                       this.hasAlmaApiResult &&
                       this.entities &&
                       this.entities.length === incoming.length &&
                       incoming.every(i => this.entities.some(e => e.id === i.id));
      if (sameList) {
        this.selectedEntity = incoming[0];
        this.selectedId = incoming[0].id;
        this.scrollToSelected();
        return;
      }

      //Tillbaka från postvyn: när en enskild post stängs skickar Alma listan igen. Almas egen lista flyttar
      //varje öppnad post först och behåller den där (efter två öppnade poster ligger båda överst), så
      //ordningen går inte att lita på. Är det samma poster som den ursprungliga listan, och appen visar
      //en enskild post ur den, visas listan i sin ursprungliga ordning med posten markerad.
      const base = this.baseEntities;
      const shownSingle = this.entities && this.entities.length === 1 ? this.entities[0] : null;
      const returningToList = incoming.length > 1 &&
                              !!shownSingle &&
                              base.length === incoming.length &&
                              base.some(e => e.id === shownSingle.id) &&
                              incoming.every(i => base.some(e => e.id === i.id));

      this.hasAlmaApiResult = false;
      this.hasLibrisResult = false;
      this.app_error = false;
      this.app_errormessage = "";

      if(this.subscription$) {
        this.subscription$.unsubscribe();
      }

      if (returningToList) {
        this.entities = [...base];
        this.selectedEntity = shownSingle;
        this.selectedId = shownSingle.id;
        this.pendingScrollId = shownSingle.id;
        this.processEntities();
        return;
      }

      if (incoming.length === 0) {
        //Ingen lista visas längre (t.ex. sökformuläret). Glöm den visade listan så att samma lista kan visas igen.
        this.entities = [];
        this.baseEntities = [];
        this.selectedId = null;
        return;
      }

      //Kom ihåg listan i ursprungsordning. En enskild post som hör till listan (postvyn) lämnar den orörd.
      if (incoming.length > 1) {
        this.baseEntities = [...incoming];
      } else if (!this.baseEntities.some(e => e.id === incoming[0].id)) {
        this.baseEntities = [];
      }

      //Annars visas det Alma just visar: en ny lista, en filtrerad lista eller en enskild post
      this.entities = [...incoming];
      this.selectedEntity = incoming[0]; 
      this.selectedId = null;
      
      this.processEntities();
    });
  }

  /**
   * Hämtar Alma- och Libris-data för de poster som visas (this.entities)
   */
  processEntities() {
    //Kör bara om poster som visas i Alma är items eller bibs eller holdings
    if ( this.entities.length > 0 && (this.entities[0].type == "BIB_MMS" || this.entities[0].type == "ITEM" || this.entities[0].type == "HOLDING")) {      

      //Samma post får inte visas två gånger
      this.entities = this.entities.filter((e, i, all) => all.findIndex(x => x.id === e.id) === i);
      this.hasAlmaApiResult = true;
      this.nrofEntetiesProcessed = 0;  

      //Varje laddning har sin egen lista. En tidigare laddning som fortfarande pågår skriver då till sin
      //egen (gamla) lista och kan inte blanda in poster i den som visas.
      const generation = ++this.loadGeneration;
      const pageitems = [];
      this.pageitems = pageitems;

      this.numberofAlmaItems = this.entities.length;

      //Gå igenom alla poster på aktuell sida.
      //Alma tillåter högst 10 samtidiga anrop från en Cloud App, så anropen körs max 10 åt gången.
      const processEntity = (e, index) => {
        pageitems[index] = [];
        let sigeltolibris: any;
        //Hämta ytterligare almainformation
        //Skapa rätt länk
        
        let almaurl = "";
        if (e.type == "HOLDING"){
          almaurl = e.link.split('/holdings')[0]
        } else {
          almaurl = e.link
        }
        
        return this.restService
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

                pageitems[index].almaholdingslink = item.holding_data.link;
                pageitems[index].mms_id = item.bib_data.mms_id;
                pageitems[index].holding_id = item.holding_data.holding_id;
                  
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
                pageitems[index].mms_id = item.mms_id;
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
                  pageitems[index].librisinstance = lib;
                  //Vilka sigel som sökts (för att veta var nya bestånd får läggas till)
                  pageitems[index].searchedsigels = (sigeltolibris || []).filter(s => s);
                  //hämta librisitem utifrån librisid (från instans)
                  let librisitem = await this.librisservice.getLibrisItem(
                    lib, //librisinstansen
                    librisarr[0], //för att visa librisid
                    bib, //för att visa title + author
                    sigeltolibris
                  );
                  pageitems[index].librisitem = librisitem;
                } catch (error) {
                  //Eventuella fel
                  pageitems[index].librisitem = {
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
                pageitems[index].librisitem = {
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
              if (generation === this.loadGeneration) {
                this.nrofEntetiesProcessed++;
                if (this.nrofEntetiesProcessed >= this.numberofAlmaItems) {
                  this.hasLibrisResult = true;
                  this.afterListLoaded();
                }
              }
            }),
            catchError(err => {
              //Troligen har något gått fel vid anropet till alma
              pageitems[index].librisitem = {
                index: index,
                  title: "",
                  librisid: {},
                  librisinstance: false,
                  librisinstancelink: "#",
                  librisholdings: [],
                  errormessage: err.message
              }
              
              if (generation === this.loadGeneration) {
                this.nrofEntetiesProcessed++;
                if (this.nrofEntetiesProcessed >= this.numberofAlmaItems) {
                  this.hasLibrisResult = true;
                  this.afterListLoaded();
                }
              }
              if (generation === this.loadGeneration) {
                this.app_error = true;
                this.app_errormessage = 'Error: ' + err.message;
              }
              return EMPTY;
            })
          )
          ;
      };

      from(this.entities.map((e, index) => ({ e, index })))
        .pipe(mergeMap(({ e, index }) => processEntity(e, index), 10))
        .subscribe();
    }
  }

  //Efter att en lista laddats om (t.ex. när en post stängts): scrolla fram den post som varit öppen
  afterListLoaded() {
    if (this.pendingScrollId) {
      this.selectedId = this.pendingScrollId;
      this.pendingScrollId = null;
      this.scrollToSelected();
    }
  }

  /**
   * Scrollar fram kortet för den post som klickats i Alma (efter att vyn ritats om)
   */
  scrollToSelected() {
    setTimeout(() => {
      const index = this.entities.findIndex(e => e.id === this.selectedId);
      const card = index >= 0 ? document.getElementById('card-' + index) : null;
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 0);
  }

  //Esc stänger listan över senast borttagna
  @HostListener('document:keydown.escape')
  onEscape() {
    this.showHistory = false;
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
  createHolding(pageitem: any, sigel?: string) {
    this.dialog
      .open(HoldingDialogComponent, {
        width: '400px',
        data: {
          mode: 'create',
          instanceid: pageitem.librisitem.instanceid,
          sigeloptions: this.getCreateOptions(pageitem).filter(o => !sigel || o.sigel === sigel),
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

  /**
   * Frågar om samma borttagning ska göras i Alma, efter att den gjorts i Libris.
   * Hoppar över frågan om sigelet saknar Alma-bibliotek i konfigurationen eller posten saknar MMS ID.
   */
  openAlmaDelete(pageitem: any, sigel: string, mode: 'all' | 'rows', rows: any[], entryId?: string) {
    const template = (this.sigels || []).find(s => s.sigel === sigel);
    if (!template || !template.almalibrarycode || !pageitem.mms_id) {
      return;
    }
    this.dialog.open(AlmaDeleteDialogComponent, {
      width: '480px',
      data: {
        mmsId: pageitem.mms_id,
        libraryCode: template.almalibrarycode,
        libraryName: this.getLibraryName(sigel),
        sigel: sigel,
        mode: mode,
        rows: rows
      }
    }).afterClosed().subscribe(async result => {
      //result = utfallet i Alma (om borttagningen kördes), sparas på posten i listan
      if (result && entryId) {
        this.deletedEntries = await this.history.update(entryId, {
          alma: { deleted: result.deleted.length, failed: result.failed.length }
        });
        //Kopia av det som togs bort i Alma, för att kunna ångra
        const snap = result.snapshot;
        if (snap && (snap.holdings.length > 0 || snap.items.length > 0)) {
          if (await this.history.mergeSnapshot(entryId, { alma: snap })) {
            this.deletedEntries = await this.history.update(entryId, { hasUndo: true });
          }
        }
      }
    });
  }

  /**
   * Lägger posten i listan över senast borttagna. Returnerar id för raden.
   */
  async recordDeletion(pageitem: any, holding: any, kind: 'all' | 'row', rowText: string, snapshot?: any): Promise<string> {
    try {
      const added = await this.history.add({
        mmsId: pageitem.mms_id,
        title: pageitem.librisitem.title,
        librisId: pageitem.librisitem.librisid,
        sigel: holding.sigel,
        libraryName: this.getLibraryName(holding.sigel),
        kind: kind,
        rows: rowText
      });
      this.deletedEntries = added.entries;
      if (snapshot && await this.history.saveSnapshot(added.id, snapshot)) {
        this.deletedEntries = await this.history.update(added.id, { hasUndo: true });
      }
      return added.id;
    } catch (e) {
      return undefined;
    }
  }

  rowText(row: any): string {
    return ['c', 'h', 'j', 'l', 't', 'i']
      .filter(f => row && row[f] && String(row[f]).trim() !== '')
      .map(f => f + '# ' + String(row[f]).trim())
      .join(' ');
  }

  /**
   * Visar en post direkt via MMS ID (även om Alma inte visar den i sin lista, t.ex. en post utan bestånd)
   */
  showPostByMms(mmsId: string) {
    if (!mmsId) { return; }
    if (this.subscription$) { this.subscription$.unsubscribe(); }
    this.app_error = false;
    this.app_errormessage = "";
    this.hasAlmaApiResult = false;
    this.hasLibrisResult = false;
    this.entities = [{ id: mmsId, type: 'BIB_MMS', link: '/bibs/' + mmsId, description: '' } as any];
    this.selectedId = null;
    this.processEntities();
    setTimeout(() => window.scrollTo(0, 0), 0);
  }

  /**
   * Efter ångra: finns posten i den lista som visas laddas listan om (så posten uppdateras och markeras),
   * annars visas posten ensam. Listan ersätts alltså inte av en enskild post.
   */
  reloadAfterUndo(mmsId: string) {
    const entity = (this.entities || []).find(e => e.id === mmsId || String(e.link || '').indexOf('/bibs/' + mmsId) === 0);
    if (!entity) {
      this.showPostByMms(mmsId);
      return;
    }
    this.pendingScrollId = entity.id;
    this.selectedId = entity.id;
    this.processEntities();
  }

  async copyMms(mmsId: string) {
    try {
      await navigator.clipboard.writeText(mmsId);
    } catch (e) {
      //Fallback när webbläsaren inte tillåter clipboard-API:t i en iframe
      const area = document.createElement('textarea');
      area.value = mmsId;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
    }
    this.alert.success(this.translate.instant('Translate.history_copied') + ' ' + mmsId);
  }

  /**
   * Ångra en borttagning: öppnar förhandsvisningen med det som kan återskapas
   */
  async openUndo(entry: DeletedEntry) {
    const snapshot = await this.history.getSnapshot(entry.id);
    this.dialog
      .open(UndoDialogComponent, {
        width: '480px',
        data: { entry: entry, snapshot: snapshot, proxyUrl: this.config.proxyUrl, authToken: this.authToken }
      })
      .afterClosed()
      .subscribe(async done => {
        if (done && (done.libris || done.alma)) {
          this.deletedEntries = await this.history.update(entry.id, {
            undone: { ...(entry.undone || {}), ...(done.libris ? { libris: true } : {}), ...(done.alma ? { alma: true } : {}) }
          });
          if (done.libris) { this.alert.success(this.translate.instant('Translate.undo_done')); }
          if (done.alma) { this.alert.success(this.translate.instant('Translate.undo_donealma')); }
          this.reloadAfterUndo(entry.mmsId);
        }
      });
  }

  async removeEntry(id: string) {
    this.deletedEntries = await this.history.remove(id);
  }

  async clearHistory() {
    this.deletedEntries = await this.history.clear();
  }

  /**
   * MMS ID och Alma-bibliotek för förhandskontrollen av Alma (saknas något görs ingen kontroll)
   */
  almaCheckData(pageitem: any, sigel: string) {
    const template = (this.sigels || []).find(t => t.sigel === sigel);
    return template && template.almalibrarycode && pageitem.mms_id
      ? { mmsId: pageitem.mms_id, libraryCode: template.almalibrarycode }
      : null;
  }

  getLibraryName(sigel: string) {
    const found = (this.sigels || []).find(s => s.sigel == sigel);
    return found ? found.libraryname : sigel;
  }

  /**
   * Öppnar bekräftelsedialog för att ta bort ett enskilt exemplar (en rad) i ett bestånd
   */
  deleteHoldingRow(pageitem: any, holding: any, rowIndex: number) {
    this.dialog
      .open(HoldingDialogComponent, {
        width: '400px',
        data: { mode: 'deleteRow', holding: holding, rowIndex: rowIndex, almaCheck: this.almaCheckData(pageitem, holding.sigel), proxyUrl: this.config.proxyUrl, authToken: this.authToken, libraryname: this.getLibraryName(holding.sigel) }
      })
      .afterClosed()
      .subscribe(async result => {
        if (result) {
          const removedRow = holding.marc_852[result.removedIndex];
          const oldGraph = holding.holdinggraph;
          holding.marc_852.splice(result.removedIndex, 1);
          holding.holdinggraph = result.graph;
          holding.etag = result.etag;
          this.alert.success(this.translate.instant('Translate.holding_rowdeleted'));
          const snapshot = {
            libris: {
              kind: 'row', sigel: holding.sigel, holdingurl: holding.holdingurl,
              index: result.removedIndex,
              component: oldGraph['@graph'][1].hasComponent && oldGraph['@graph'][1].hasComponent[result.removedIndex]
            }
          };
          const entryId = await this.recordDeletion(pageitem, holding, 'row', this.rowText(removedRow), snapshot);
          this.openAlmaDelete(pageitem, holding.sigel, 'rows', [removedRow], entryId);
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
        data: { mode: 'delete', holding: holding, almaCheck: this.almaCheckData(pageitem, holding.sigel), proxyUrl: this.config.proxyUrl, authToken: this.authToken, libraryname: libraryname }
      })
      .afterClosed()
      .subscribe(async result => {
        if (result) {
          const holdings = pageitem.librisitem.librisholdings;
          holdings.splice(holdings.indexOf(holding), 1);
          if (holdings.length == 0) {
            pageitem.librisitem.errormessage = this.translate.instant('Translate.noholdingsfound');
          }
          this.alert.success(this.translate.instant('Translate.holding_deleted'));
          const snapshot = { libris: { kind: 'all', sigel: holding.sigel, graph: holding.holdinggraph } };
          const entryId = await this.recordDeletion(pageitem, holding, 'all', String(holding.marc_852.length), snapshot);
          this.openAlmaDelete(pageitem, holding.sigel, 'all', holding.marc_852, entryId);
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
