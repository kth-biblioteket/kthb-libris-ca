import { Component, OnInit } from '@angular/core';
import { AlertService, CloudAppConfigService } from '@exlibris/exl-cloudapp-angular-lib';
import { TranslateService } from '@ngx-translate/core';
import { HOLDING_FIELDS, normalizeFields } from '../models/holding-fields';
import { UserSettingsService, FieldSetting } from '../user-settings.service';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html'
})
export class SettingsComponent implements OnInit {
  holdingFields = HOLDING_FIELDS;
  keys: FieldSetting[] = ['displayFields', 'formFields'];
  selected: { [key: string]: string[] } = { displayFields: [], formFields: [] };
  institution: { [key: string]: string[] } = { displayFields: [], formFields: [] };
  own: { [key: string]: boolean } = { displayFields: false, formFields: false };
  loading: boolean = true;
  saving: boolean = false;

  constructor(
    private userSettings: UserSettingsService,
    private configService: CloudAppConfigService,
    private alert: AlertService,
    private translate: TranslateService
  ) {}

  ngOnInit() {
    this.configService.get().subscribe(conf => {
      this.keys.forEach(key => this.institution[key] = normalizeFields(conf[key]));
      let remaining = this.keys.length;
      this.keys.forEach(key => {
        this.userSettings.getFields(key).subscribe(own => {
          this.own[key] = !!own;
          this.selected[key] = own || this.institution[key].slice();
          if (--remaining === 0) { this.loading = false; }
        });
      });
    });
  }

  get personal(): boolean {
    return this.keys.some(key => this.own[key]);
  }

  isChecked(key: FieldSetting, code: string): boolean {
    return this.selected[key].includes(code);
  }

  toggle(key: FieldSetting, code: string, checked: boolean) {
    const current = this.selected[key].filter(c => c !== code);
    const next = checked ? current.concat(code) : current;
    this.selected[key] = HOLDING_FIELDS.map(f => f.code).filter(c => next.includes(c));
  }

  save() {
    if (this.keys.some(key => this.selected[key].length === 0)) {
      this.alert.error(this.translate.instant('Translate.settings_atleastone'));
      return;
    }
    this.saving = true;
    //Sparas efter varandra eftersom varje anrop skriver hela inställningsobjektet
    this.userSettings.setFields('displayFields', this.selected['displayFields']).subscribe(
      () => this.userSettings.setFields('formFields', this.selected['formFields']).subscribe(
        () => {
          this.keys.forEach(key => this.own[key] = true);
          this.saving = false;
          this.alert.success(this.translate.instant('Translate.settings_saved'));
        },
        err => this.fail(err)
      ),
      err => this.fail(err)
    );
  }

  useInstitution() {
    this.saving = true;
    this.userSettings.setFields('displayFields', null).subscribe(
      () => this.userSettings.setFields('formFields', null).subscribe(
        () => {
          this.keys.forEach(key => {
            this.own[key] = false;
            this.selected[key] = this.institution[key].slice();
          });
          this.saving = false;
          this.alert.success(this.translate.instant('Translate.settings_reset_done'));
        },
        err => this.fail(err)
      ),
      err => this.fail(err)
    );
  }

  private fail(err: any) {
    this.saving = false;
    this.alert.error(err && err.message ? err.message : String(err));
  }
}
