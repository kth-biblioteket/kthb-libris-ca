import { Injectable } from '@angular/core';
import { CloudAppSettingsService } from '@exlibris/exl-cloudapp-angular-lib';
import { Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { HOLDING_FIELDS } from './models/holding-fields';

export type FieldSetting = 'displayFields' | 'formFields';

/**
 * Personliga inställningar (sparas per användare i Alma, till skillnad från konfigurationen som gäller hela institutionen).
 */
@Injectable({
  providedIn: 'root'
})
export class UserSettingsService {
  constructor(private settingsService: CloudAppSettingsService) {}

  /**
   * Användarens egna val av 852-delfält för 'displayFields' (visas i kortet) eller 'formFields' (finns i formulären),
   * eller null om användaren inte har gjort något val (då gäller institutionens val).
   */
  getFields(key: FieldSetting): Observable<string[] | null> {
    return this.settingsService.get().pipe(
      map(settings => {
        const wanted = Array.isArray(settings[key]) ? settings[key].map(String) : [];
        const valid = HOLDING_FIELDS.map(f => f.code).filter(code => wanted.includes(code));
        return valid.length > 0 ? valid : null;
      })
    );
  }

  /** Sparar användarens val, eller tar bort det (null) så att institutionens val gäller igen. */
  setFields(key: FieldSetting, fields: string[] | null): Observable<any> {
    return this.settingsService.get().pipe(
      switchMap(settings => {
        const next = Object.assign({}, settings);
        if (fields && fields.length > 0) {
          next[key] = fields;
        } else {
          delete next[key];
        }
        return this.settingsService.set(next);
      })
    );
  }
}
