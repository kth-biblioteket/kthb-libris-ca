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
import {ToastrService} from 'ngx-toastr';
import {Configuration} from '../models/configuration';
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
    private toastr: ToastrService,
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
            this.toastr.success(toastMessage);
        },
        err => this.toastr.error(err.message),
        () => this.saving = false
    );
    this.saving = false;
  }

  save() {
    this.saving = true;
    this.configuration.proxyUrl = this.form.value.proxyUrl
    this.configuration.librisUrl = this.form.value.librisUrl
    this.configService.set(this.configuration).subscribe(
      () => {
        this.toastr.success('Configuration successfully saved.')
        this.form.markAsPristine();
      },
      err => this.alert.error(err.message),
      ()  => this.saving = false
    );
  }
  
  resetconfiguration() {
    this.configService.set([]).subscribe(
      () => {
        this.toastr.success('Configuration successfully reset.')
        this.configuration.proxyUrl = "";
        this.configuration.librisUrl = "";
        this.configuration.LibrisSigelTemplate = [];
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