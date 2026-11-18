import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CloudAppEventsService } from '@exlibris/exl-cloudapp-angular-lib';
import { TranslateService } from '@ngx-translate/core';
import { AlmaService, AlmaHolding, AlmaItem, AlmaDeletePlan, AlmaDeleteResult } from '../../alma.service';

/**
 * Frågar om samma borttagning ska göras i Alma som just gjordes i Libris, och visar vad som tas bort.
 *   mode 'all':  alla bibliotekets holdings-poster med exemplar
 *   mode 'rows': de exemplar som motsvarar de borttagna Libris-raderna (matchning på hyllkod)
 */
@Component({
  selector: 'app-alma-delete-dialog',
  templateUrl: './alma-delete-dialog.component.html',
})
export class AlmaDeleteDialogComponent implements OnInit {

  mmsId: string;
  libraryCode: string;
  libraryName: string;
  sigel: string;
  mode: 'all' | 'rows';
  rows: any[];
  librisMessage: string;

  loading: boolean = true;
  busy: boolean = false;
  error: string = '';
  holdings: AlmaHolding[] = [];
  selected: { [pid: string]: boolean } = {};
  matched: AlmaItem[] = [];
  result: AlmaDeleteResult = null;

  //Den bibliografiska posten: erbjuds när inga holdings eller exemplar finns kvar på posten
  bibRecord: { mmsId: string, title: string, record: any } = null;
  offerBib: boolean = false;
  bibDeleted: boolean = false;
  bibError: string = '';

  constructor(
    public dialogRef: MatDialogRef<AlmaDeleteDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private alma: AlmaService,
    private eventsService: CloudAppEventsService,
    private translate: TranslateService
  ) {
    this.mmsId = data.mmsId;
    this.libraryCode = data.libraryCode;
    this.libraryName = data.libraryName;
    this.sigel = data.sigel;
    this.mode = data.mode;
    this.rows = data.rows || [];
    this.librisMessage = data.librisMessage || '';
    //Stängs dialogen med Esc eller genom klick utanför ska utfallet ändå följa med, annars sparas ingen kopia för att ångra i Alma
    this.dialogRef.backdropClick().subscribe(() => this.dialogRef.close(this.result));
    this.dialogRef.keydownEvents().subscribe(ev => {
      if (ev.key === 'Escape') { this.dialogRef.close(this.result); }
    });
  }

  async ngOnInit() {
    try {
      this.holdings = await this.alma.getLibraryHoldings(this.mmsId, this.libraryCode);
      if (this.mode === 'rows') {
        this.matched = this.alma.matchItems(this.holdings, this.rows);
        this.matched.forEach(i => this.selected[i.pid] = true);
      }
    } catch (e) {
      this.error = this.translate.instant('Translate.alma_loadfailed') + (e && e.message ? e.message : e);
    }
    this.loading = false;
  }

  get hasNothing() {
    return !this.loading && !this.error && this.holdings.length === 0;
  }

  get noMatch() {
    return this.mode === 'rows' && this.matched.length === 0 && this.holdings.length > 0;
  }

  get selectedItems(): AlmaItem[] {
    const all: AlmaItem[] = [].concat(...this.holdings.map(h => h.items));
    return this.mode === 'all' ? all : all.filter(i => this.selected[i.pid]);
  }

  get plan(): AlmaDeletePlan {
    return this.mode === 'all'
      ? this.alma.planAll(this.mmsId, this.holdings)
      : this.alma.planItems(this.mmsId, this.holdings, this.selectedItems);
  }

  isEmptied(holding: AlmaHolding) {
    return this.plan.holdings.some(h => h.holding_id === holding.holding_id);
  }

  async remove() {
    this.busy = true;
    this.error = '';
    try {
      const plan = this.plan;
      //Kopia av posterna sparas innan något tas bort. Går det inte avbryts borttagningen.
      let snapshot;
      try {
        snapshot = await this.alma.snapshot(plan);
      } catch (e) {
        this.error = this.translate.instant('Translate.alma_snapshotfailed') + (e && e.message ? e.message : e);
        this.busy = false;
        return;
      }
      const result = await this.alma.executeDelete(plan);
      result.snapshot = this.alma.filterSnapshot(snapshot, result);
      this.result = result;
      await this.checkBibOffer(result);
    } catch (e) {
      this.error = this.translate.instant('Translate.alma_deletefailed') + (e && e.message ? e.message : e);
    }
    this.busy = false;
  }

  /**
   * Finns varken holdings eller exemplar kvar (för något bibliotek) erbjuds borttagning av den bibliografiska posten.
   */
  private async checkBibOffer(result: AlmaDeleteResult) {
    if (result.failed.length > 0) { return; }
    try {
      if (await this.alma.countHoldings(this.mmsId) === 0) {
        //Kopian hämtas innan frågan visas, så att borttagningen går att ångra
        this.bibRecord = await this.alma.getBib(this.mmsId);
        this.offerBib = true;
      }
    } catch (e) {
      //Posten lämnas orörd, men användaren ska få veta att kontrollen inte gick
      this.bibError = this.translate.instant('Translate.alma_bib_checkfailed') + this.alma.errorMessage(e);
    }
  }

  keepBib() {
    this.offerBib = false;
  }

  async removeBib() {
    this.busy = true;
    this.bibError = '';
    try {
      await this.alma.deleteBib(this.mmsId);
      this.result.snapshot.bib = this.bibRecord;
      this.bibDeleted = true;
      this.offerBib = false;
    } catch (e) {
      this.bibError = this.translate.instant('Translate.alma_bib_failed') + ': ' + this.alma.errorMessage(e);
    }
    this.busy = false;
  }

  refreshAlma() {
    this.eventsService.refreshPage().subscribe();
    this.dialogRef.close(this.result);
  }
}
