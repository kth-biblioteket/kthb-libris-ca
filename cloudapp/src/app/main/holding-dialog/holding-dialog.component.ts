import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';
import { LibrisService } from '../../libris.service';
import { AlmaService } from '../../alma.service';

@Component({
  selector: 'app-holding-dialog',
  templateUrl: './holding-dialog.component.html',
})
export class HoldingDialogComponent implements OnInit {

  mode: 'edit' | 'add' | 'create' | 'delete' | 'deleteRow';
  instanceid: string;
  sigeloptions: any[] = [];
  selectedSigel: string = '';
  rowIndex: number;
  row: any;
  holding: any;
  proxyUrl: string;
  authToken: string;
  libraryname: string;

  original: any[];
  edited: any[];
  changes: any[] = [];
  preview: boolean = false;
  busy: boolean = false;
  error: string = '';

  //Kontroll av Alma innan något tas bort i Libris (varnar, hindrar inte)
  almaChecking: boolean = false;
  almaCheckFailed: boolean = false;
  almaWarnings: { label: string, reasons: string[] }[] = [];

  constructor(
    public dialogRef: MatDialogRef<HoldingDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private librisservice: LibrisService,
    private alma: AlmaService,
    private translate: TranslateService
  ) {
    this.mode = data.mode;
    this.holding = data.holding || { sigel: '' };
    this.instanceid = data.instanceid;
    this.sigeloptions = data.sigeloptions || [];
    if (this.sigeloptions.length == 1) {
      this.selectedSigel = this.sigeloptions[0].sigel;
    }
    this.proxyUrl = data.proxyUrl;
    this.authToken = data.authToken;
    this.libraryname = data.libraryname;
    this.rowIndex = data.rowIndex;
    this.row = this.holding.marc_852 ? this.holding.marc_852[this.rowIndex] : null;
    this.original = (this.mode == 'add' || this.mode == 'create')
      ? [{ c: '', h: '', j: '', l: '', t: '', i: '' }]
      : (this.mode == 'edit' && this.rowIndex !== undefined)
        ? [this.holding.marc_852[this.rowIndex]]
        : this.holding.marc_852;
    this.edited = JSON.parse(JSON.stringify(this.original));
  }

  async ngOnInit() {
    const check = this.data.almaCheck;
    if (!check || (this.mode !== 'delete' && this.mode !== 'deleteRow')) { return; }
    this.almaChecking = true;
    try {
      const holdings = await this.alma.getLibraryHoldings(check.mmsId, check.libraryCode);
      const items = this.mode === 'delete'
        ? [].concat(...holdings.map(h => h.items))
        : this.alma.matchItems(holdings, [this.row]);
      this.almaWarnings = this.alma.deleteWarnings(items);
    } catch (e) {
      this.almaCheckFailed = true;
    }
    this.almaChecking = false;
  }

  reasonText(reason: string): string {
    const key = 'Translate.holding_alma_r_' + reason;
    const text = this.translate.instant(key);
    return text === key ? reason : text;
  }

  get isForm() {
    return this.mode == 'edit' || this.mode == 'add' || this.mode == 'create';
  }

  showPreview() {
    this.changes = this.librisservice.diffHolding(this.original, this.edited);
    //Redigering av en enskild rad: ändringarna gäller radens riktiga plats i beståndet
    if (this.mode == 'edit' && this.rowIndex !== undefined) {
      this.changes.forEach(change => change.index = this.rowIndex);
    }
    this.preview = true;
  }

  async save() {
    this.busy = true;
    this.error = '';
    try {
      if (this.mode == 'create') {
        const newholding = await this.librisservice.createLibrisHolding(
          this.instanceid, this.selectedSigel, this.edited[0], this.proxyUrl, this.authToken);
        this.dialogRef.close({ newHolding: newholding });
        return;
      }
      if (this.mode == 'add') {
        const added = this.librisservice.addHoldingComponent(this.holding.holdinggraph, this.edited[0]);
        const addresult = await this.librisservice.updateLibrisHolding(this.holding, added.graph, this.proxyUrl, this.authToken);
        this.dialogRef.close({ graph: addresult.graph, etag: addresult.etag, newRow: this.edited[0], replacedEmpty: added.replacedEmpty });
        return;
      }
      const graph = this.librisservice.applyHoldingChanges(this.holding.holdinggraph, this.changes);
      const result = await this.librisservice.updateLibrisHolding(this.holding, graph, this.proxyUrl, this.authToken);
      this.dialogRef.close({ marc_852: this.edited, graph: result.graph, etag: result.etag, rowIndex: this.rowIndex });
    } catch (e) {
      this.error = this.errorMessage(e);
      this.busy = false;
    }
  }

  async removeRow() {
    this.busy = true;
    this.error = '';
    try {
      const graph = this.librisservice.removeHoldingComponent(this.holding.holdinggraph, this.rowIndex);
      const result = await this.librisservice.updateLibrisHolding(this.holding, graph, this.proxyUrl, this.authToken);
      this.dialogRef.close({ graph: result.graph, etag: result.etag, removedIndex: this.rowIndex });
    } catch (e) {
      this.error = this.errorMessage(e);
      this.busy = false;
    }
  }

  async remove() {
    this.busy = true;
    this.error = '';
    try {
      await this.librisservice.deleteLibrisHolding(this.holding, this.proxyUrl, this.authToken);
      this.dialogRef.close(true);
    } catch (e) {
      this.error = this.errorMessage(e);
      this.busy = false;
    }
  }

  private errorMessage(e: any) {
    if (e && (e.status === 409 || e.status === 412)) {
      return this.translate.instant('Translate.holding_conflict');
    }
    return this.translate.instant('Translate.holding_updatefailed') + (e && e.message ? e.message : e);
  }
}
