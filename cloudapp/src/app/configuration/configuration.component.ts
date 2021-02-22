import { Component, OnInit, Injectable } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { CloudAppConfigService, CloudAppEventsService, CloudAppRestService, InitData, AlertService } from '@exlibris/exl-cloudapp-angular-lib';
import { CanActivate, Router } from '@angular/router';
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
  
  constructor(
    private fb: FormBuilder,
    private configService: CloudAppConfigService,
    private toastr: ToastrService,
    private alert: AlertService,
    public dialog: MatDialog
  ) { }

  ngOnInit() {
    this.form = this.fb.group({
      proxyUrl: this.fb.control(''),
      librisUrl: this.fb.control('')
    });
    this.getConfiguration();
  }

  private getConfiguration() {
    this.configService.get().subscribe(result => {
      if (!result.proxyUrl) {
        result = new Configuration();
      }
      this.configuration = result;
      this.configService.getAsFormGroup().subscribe( config => {
        if (Object.keys(config.value).length!=0) {
          this.form = config;
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
        this.alert.success('Configuration successfully saved.');
        this.form.markAsPristine();
      },
      err => this.alert.error(err.message),
      ()  => this.saving = false
    );
  }
  
  resetconfiguration() {
    this.configService.set([]).subscribe(
      () => {
        this.alert.success('Configuration successfully reset.');
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

  openDialog() {
    this.dialogOpen = true;
    const dialogRef = this.dialog.open(ConfigurationDialogComponent, {
      width: '95%',
      data: new LibrisSigelTemplate()
    });

    dialogRef.afterClosed().subscribe(result  => {
      result = result as LibrisSigelTemplate;
      this.dialogOpen = false;
      const readyForSaving =result.sigel != ''
      if (readyForSaving) {
        this.configuration.LibrisSigelTemplate.push(result);
        this.saveConfig('Sigel: ' + result.sigel + ' saved to config.');
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