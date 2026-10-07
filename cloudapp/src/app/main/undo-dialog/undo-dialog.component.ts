import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';
import { LibrisService } from '../../libris.service';
import { AlmaService, AlmaRestoreResult } from '../../alma.service';
import { DeletedEntry } from '../../history.service';

/**
 * Ångra en borttagning: återskapar det som togs bort i Libris från den sparade informationen.
 * Posterna får nya id:n. Förhandsvisningen visar vad som skapas innan något sker.
 */
@Component({
  selector: 'app-undo-dialog',
  templateUrl: './undo-dialog.component.html',
})
export class UndoDialogComponent {

  entry: DeletedEntry;
  snapshot: any;
  proxyUrl: string;
  authToken: string;

  busy: boolean = false;
  error: string = '';
  done: { libris?: boolean, alma?: boolean } = {};
  almaResult: AlmaRestoreResult = null;

  constructor(
    public dialogRef: MatDialogRef<UndoDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private librisservice: LibrisService,
    private alma: AlmaService,
    private translate: TranslateService
  ) {
    this.entry = data.entry;
    this.snapshot = data.snapshot;
    this.proxyUrl = data.proxyUrl;
    this.authToken = data.authToken;
  }

  get libris() {
    return this.snapshot && this.snapshot.libris;
  }

  get almaSnapshot() {
    const snap = this.snapshot && this.snapshot.alma;
    return snap && (snap.holdings.length > 0 || snap.items.length > 0) ? snap : null;
  }

  get almaAlreadyUndone() {
    return !!(this.entry.undone && this.entry.undone.alma);
  }

  async undoAlma() {
    this.busy = true;
    this.error = '';
    try {
      this.almaResult = await this.alma.restore(this.almaSnapshot);
      //Räknas som ångrat så snart något har skapats (resten visas i resultatet)
      if (this.almaResult.created.length > 0) {
        this.done.alma = true;
      }
    } catch (e) {
      this.error = this.translate.instant('Translate.alma_deletefailed') + (e && e.message ? e.message : e);
    }
    this.busy = false;
  }

  get librisAlreadyUndone() {
    return !!(this.entry.undone && this.entry.undone.libris);
  }

  //De rader som återskapas (för förhandsvisningen)
  get librisRows(): any[] {
    if (!this.libris) { return []; }
    const item = this.libris.graph && this.libris.graph['@graph'] && this.libris.graph['@graph'][1];
    if (this.libris.kind === 'row') {
      return [this.rowFromNode(this.libris.component)];
    }
    if (!item) { return []; }
    const nodes = Array.isArray(item.hasComponent) ? item.hasComponent : [item];
    return nodes.map(n => this.rowFromNode(n));
  }

  private rowFromNode(node: any) {
    const shelfmark = Array.isArray(node && node.shelfMark) ? node.shelfMark[0] : (node && node.shelfMark);
    const label = shelfmark && (Array.isArray(shelfmark.label) ? shelfmark.label[0] : shelfmark.label);
    return {
      h: label || '',
      j: (node && node.shelfControlNumber) || '',
      l: (node && node.shelfLabel) || '',
      t: (node && node.copyNumber) || ''
    };
  }

  async undoLibris() {
    this.busy = true;
    this.error = '';
    try {
      if (this.libris.kind === 'all') {
        await this.librisservice.restoreLibrisHolding(this.libris.graph, this.libris.sigel, this.proxyUrl, this.authToken);
      } else {
        await this.librisservice.restoreLibrisRow(
          this.libris.holdingurl, this.libris.sigel, this.libris.component, this.libris.index, this.proxyUrl, this.authToken);
      }
      this.done.libris = true;
    } catch (e) {
      this.error = this.errorMessage(e);
    }
    this.busy = false;
  }

  close() {
    this.dialogRef.close(this.done);
  }

  private errorMessage(e: any) {
    if (e && (e.status === 409 || e.status === 412)) {
      return this.translate.instant('Translate.holding_conflict');
    }
    if (e && (e.status === 404 || e.status === 410)) {
      return this.translate.instant('Translate.undo_gone');
    }
    return this.translate.instant('Translate.holding_updatefailed') + (e && e.message ? e.message : e);
  }
}
