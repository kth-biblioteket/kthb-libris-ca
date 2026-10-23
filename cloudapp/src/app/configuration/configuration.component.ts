import { Component, OnInit, Injectable } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { CloudAppConfigService, CloudAppEventsService, CloudAppRestService, InitData, AlertService } from '@exlibris/exl-cloudapp-angular-lib';
import { CanActivate, Router, 
  Event as RouterEvent,
  NavigationStart,
  NavigationEnd,
  NavigationCancel,
  NavigationError } from '@angular/router';
import { Observable, iif, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { ErrorMessages } from '../static/error.component';
import {Configuration} from '../models/configuration';
import { HOLDING_FIELDS, normalizeFields, DEFAULT_FIELDS } from '../models/holding-fields';
import {LibrisSigelTemplate} from "../models/libris-sigel-template";
import {MatDialog} from "@angular/material/dialog";
import {ConfigurationDialogComponent} from "./configuration-dialog/configuration-dialog.component";

@Component({
  selector: 'app-configuration',
  templateUrl: './configuration.component.html',
  styleUrls: ['./configuration.component.scss']
})
export class ConfigurationComponent implements OnInit {
  LibrisSigelTemplate: LibrisSigelTemplate[] = [];
  configuration: Configuration;
  saving = false;
  dialogOpen: boolean = false;
  form: FormGroup;
  sigelform: FormGroup;
  loading: boolean = true;
  
  constructor(
    private fb: FormBuilder,
    private configService: CloudAppConfigService,
    private alert: AlertService,
    public dialog: MatDialog,
    private router: Router
  ) {
    this.router.events.subscribe((e : RouterEvent) => {
      this.navigationInterceptor(e);
    })
   }
  
  // Shows and hides the loading spinner during RouterEvent changes
  navigationInterceptor(event: RouterEvent): void {
    if (event instanceof NavigationStart) {
      this.loading = true
      console.log("NavigationStart")
    }
    if (event instanceof NavigationEnd) {
      this.loading = false
      console.log("NavigationEnd")
    }

    // Set loading state to false in both of the below events to hide the spinner in case a request fails
    if (event instanceof NavigationCancel) {
      this.loading = false
      console.log("NavigationCancel")
    }
    if (event instanceof NavigationError) {
      this.loading = false
      console.log("NavigationError")
    }
  }

  //Delfält i 852 att välja bland (se models/holding-fields.ts)
  holdingFields = HOLDING_FIELDS;
  displayFields: string[] = DEFAULT_FIELDS.slice();
  formFields: string[] = DEFAULT_FIELDS.slice();

  isChecked(list: 'displayFields' | 'formFields', code: string): boolean {
    return this[list].includes(code);
  }

  toggleField(list: 'displayFields' | 'formFields', code: string, checked: boolean) {
    const current = this[list].filter(c => c !== code);
    this[list] = normalizeFieldsKeepEmpty(checked ? current.concat(code) : current);
    this.form.markAsDirty();
  }

  ngOnInit() {
    this.loading = true
    this.form = this.fb.group({
      proxyUrl: this.fb.control(''),
      librisUrl: this.fb.control('')
    });
    this.getConfiguration();
  }

  private getConfiguration() {
    this.configService.get().subscribe(result => {
      if (!result.proxyUrl && !result.librisUrl && !result.LibrisSigelTemplate) {
        result = new Configuration();
      }
      this.configuration = result;
      this.displayFields = normalizeFields(result.displayFields);
      this.formFields = normalizeFields(result.formFields);
      this.configService.getAsFormGroup().subscribe( config => {
        if (Object.keys(config.value).length!=0) {
          this.form = config;
          this.loading = false  
        }
      });
    })
  }

  private saveConfig(toastMessage:string) {
    this.saving = true;
    this.configService.set(this.configuration).subscribe(
        response => {
            this.alert.success(toastMessage);
        },
        err => this.alert.error(err.message),
        () => this.saving = false
    );
    this.saving = false;
  }

  save() {
    if (this.displayFields.length === 0 || this.formFields.length === 0) {
      this.alert.error('Select at least one field in each of the two columns (shown on the card / in the forms).');
      return;
    }
    this.saving = true;
    this.configuration.proxyUrl = this.form.value.proxyUrl
    this.configuration.librisUrl = this.form.value.librisUrl
    this.configuration.displayFields = this.displayFields
    this.configuration.formFields = this.formFields
    this.configService.set(this.configuration).subscribe(
      () => {
        this.alert.success('Configuration successfully saved.')
        this.form.markAsPristine();
      },
      err => this.alert.error(err.message),
      ()  => this.saving = false
    );
  }
  
  resetconfiguration() {
    this.configService.set([]).subscribe(
      () => {
        this.alert.success('Configuration successfully reset.')
        this.configuration.proxyUrl = "";
        this.configuration.librisUrl = "";
        this.configuration.LibrisSigelTemplate = [];
        this.configuration.displayFields = [];
        this.configuration.formFields = [];
        this.displayFields = DEFAULT_FIELDS.slice();
        this.formFields = DEFAULT_FIELDS.slice();
        this.form.reset()
        this.form.markAsPristine();
      },
      err => this.alert.error(err.message),
      ()  => this.saving = false
    );
  }

  remove(removableLibrisSigelTemplate: LibrisSigelTemplate) {
    this.configuration.LibrisSigelTemplate = this.configuration.LibrisSigelTemplate.filter(LibrisSigelTemplate => LibrisSigelTemplate.id != removableLibrisSigelTemplate.id);
    this.saveConfig('Template: ' + removableLibrisSigelTemplate.sigel + ' removed from config.');
  }

  update(removableLibrisSigelTemplate: LibrisSigelTemplate) {
    this.configuration.LibrisSigelTemplate = this.configuration.LibrisSigelTemplate.filter(LibrisSigelTemplate => LibrisSigelTemplate.id == removableLibrisSigelTemplate.id);
    this.saveConfig('Template: ' + removableLibrisSigelTemplate.sigel + ' updated in config.');
  }

  openDialog(action, item = new LibrisSigelTemplate()) {
    this.dialogOpen = true;

    let dialogRef: any;
      dialogRef = this.dialog.open(ConfigurationDialogComponent, {
        width: '95%',
        data: item
      });

    dialogRef.afterClosed().subscribe(result  => {
      result = result as LibrisSigelTemplate;
      this.dialogOpen = false;
      const readyForSaving =result.sigel != ''
      if (readyForSaving) {
        //edit eller add?
        if(action === "add") {
          this.configuration.LibrisSigelTemplate.push(result);
          this.saveConfig('Sigel: ' + result.sigel + ' saved to config.');
        } 
        if(action === "edit") {
          this.configuration.LibrisSigelTemplate = this.configuration.LibrisSigelTemplate.filter(LibrisSigelTemplate => LibrisSigelTemplate.id != result.id);
          this.configuration.LibrisSigelTemplate.push(result);
          this.saveConfig('Sigel: ' + result.sigel + ' saved to config.');
        }
        
      }
    });

  }


}

@Injectable({
  providedIn: 'root',
})
export class ConfigurationGuard implements CanActivate {
  constructor (
    private eventsService: CloudAppEventsService,
    private restService: CloudAppRestService,
    private router: Router
  ) {}

  canActivate(): Observable<boolean> {
    return this.eventsService.getInitData().pipe(
      switchMap( initData => this.restService.call(`/users/${initData.user.primaryId}`)),
      map( user => {
        if (!user.user_role.some(role=>role.role_type.value=='221')) {
          this.router.navigate(['/error'], 
            { queryParams: { error: ErrorMessages.NO_ACCESS }});
          return false;
        }
        return true;
      })
    );
  }
}
//Som normalizeFields men en tom lista förblir tom (så att man kan avmarkera allt innan man väljer om)
function normalizeFieldsKeepEmpty(list: string[]): string[] {
  return HOLDING_FIELDS.map(f => f.code).filter(code => list.includes(code));
}
