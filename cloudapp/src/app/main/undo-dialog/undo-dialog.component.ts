import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CloudAppEventsService } from '@exlibris/exl-cloudapp-angular-lib';
import { TranslateService } from '@ngx-translate/core';
import { LibrisService, LibrisWriter } from '../../libris.service';
import { LibrisAuthService } from '../../libris-auth.service';
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
  writer: LibrisWriter;

  busy: boolean = false;
  error: string = '';
  //alma = något skapades i Alma; almaRetry = det som återstår om något misslyckades (sparas så att man kan försöka igen)
  working: '' | 'libris' | 'alma' = '';
  done: { libris?: boolean, alma?: boolean, almaRetry?: any } = {};
  almaResult: AlmaRestoreResult = null;

  constructor(
    public dialogRef: MatDialogRef<UndoDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private librisservice: LibrisService,
    private alma: AlmaService,
    private translate: TranslateService,
    private auth: LibrisAuthService,
    private eventsService: CloudAppEventsService
  ) {
    this.entry = data.entry;
    this.snapshot = data.snapshot;
    this.writer = data.writer;
    //Esc och klick utanför ska behandlas som Stäng, annars försvinner utfallet (och det som återstår i Alma)
    this.dialogRef.backdropClick().subscribe(() => this.close());
    this.dialogRef.keydownEvents().subscribe(ev => {
      if (ev.key === 'Escape') { this.close(); }
    });
  }

  get libris() {
    return this.snapshot && this.snapshot.libris;
  }

  get bibLabel() {
    return this.almaSnapshot && this.almaSnapshot.bib ? this.alma.bibLabel(this.almaSnapshot.bib) : '';
  }

  get almaSnapshot() {
    const snap = this.snapshot && this.snapshot.alma;
    return snap && (snap.holdings.length > 0 || snap.items.length > 0 || snap.bib) ? snap : null;
  }

  get almaAlreadyUndone() {
    return !!(this.entry.undone && this.entry.undone.alma);
  }

  async undoAlma() {
    this.busy = true;
    this.working = 'alma';
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
    this.working = '';
  }

  /**
   * Försöker igen med det som inte kunde skapas, utan att skapa om det som redan lyckades.
   */
  async retryAlma() {
    this.busy = true;
    this.working = 'alma';
    this.error = '';
    try {
      const again = await this.alma.restore(this.almaResult.retry);
      this.almaResult = {
        created: this.almaResult.created.concat(again.created),
        failed: again.failed,
        notes: (this.almaResult.notes || []).concat(again.notes || []),
        retry: again.retry,
        newMmsId: this.almaResult.newMmsId || again.newMmsId
      };
    } catch (e) {
      this.error = this.translate.instant('Translate.alma_deletefailed') + (e && e.message ? e.message : e);
    }
    this.busy = false;
    this.working = '';
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
    this.working = 'libris';
    this.error = '';
    try {
      if (this.libris.kind === 'all') {
        await this.librisservice.restoreLibrisHolding(this.libris.graph, this.libris.sigel, this.writer);
      } else {
        await this.librisservice.restoreLibrisRow(
          this.libris.holdingurl, this.libris.sigel, this.libris.component, this.libris.index, this.writer);
      }
      this.done.libris = true;
    } catch (e) {
      this.error = this.errorMessage(e);
    }
    this.busy = false;
    this.working = '';
  }

  close() {
    const failed = !!(this.almaResult && this.almaResult.failed.length > 0 && this.almaResult.retry);
    this.dialogRef.close({
      libris: this.done.libris,
      alma: this.done.alma,
      //Är något kvar att skapa räknas Alma inte som ångrat, och det som återstår sparas
      almaComplete: this.done.alma && !failed,
      almaRetry: failed ? this.almaResult.retry : undefined,
      newMmsId: this.almaResult && this.almaResult.newMmsId
    });
  }

  //Alma visar inte de återskapade posterna förrän sidan har laddats om
  refreshAlma() {
    this.eventsService.refreshPage().subscribe();
    this.close();
  }

  private errorMessage(e: any) {
    if (this.writer && this.writer.direct && e && e.status === 401) {
      this.auth.logout();
      return this.translate.instant('Translate.login_expired');
    }
    if (this.writer && this.writer.direct && e && e.status === 403) {
      return this.translate.instant('Translate.login_forbidden');
    }
    if (e && (e.status === 409 || e.status === 412)) {
      return this.translate.instant('Translate.holding_conflict');
    }
    if (e && (e.status === 404 || e.status === 410)) {
      return this.translate.instant('Translate.undo_gone');
    }
    return this.translate.instant('Translate.holding_updatefailed') + (e && e.message ? e.message : e);
  }
}
