import { NgModule } from '@angular/core';
import { HttpClientModule, HttpClientJsonpModule } from '@angular/common/http';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MaterialModule, getTranslateModule, AlertModule } from '@exlibris/exl-cloudapp-angular-lib';
import { ToastrModule } from 'ngx-toastr';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { MainComponent } from './main/main.component';

import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { TopmenuComponent } from './topmenu/topmenu.component';
import { ConfigurationComponent } from './configuration/configuration.component';
import { ErrorComponent } from './static/error.component';
import { ConfigurationDialogComponent } from './configuration/configuration-dialog/configuration-dialog.component';

import { LibrisService } from './libris.service';

export function getToastrModule() {
  return ToastrModule.forRoot({
    positionClass: 'toast-top-right',
    timeOut: 2000
  });
}

@NgModule({
  declarations: [
    AppComponent,
    MainComponent,
    TopmenuComponent,
    ConfigurationComponent,
    ErrorComponent,
    ConfigurationDialogComponent
  ],
  imports: [
    MaterialModule,
    BrowserModule,
    BrowserAnimationsModule,
    AppRoutingModule,
    HttpClientModule,
    HttpClientJsonpModule,
    FormsModule,
    ReactiveFormsModule,
    getTranslateModule(),
    getToastrModule(),
    AlertModule,
  ],
  providers: [
    LibrisService
  ],
  bootstrap: [AppComponent],
  entryComponents: [
     ConfigurationDialogComponent
  ]
})
export class AppModule { }
