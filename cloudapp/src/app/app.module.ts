import { NgModule } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MaterialModule, CloudAppTranslateModule, AlertModule } from '@exlibris/exl-cloudapp-angular-lib';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { MainComponent } from './main/main.component';
import { TopmenuComponent } from './topmenu/topmenu.component';
import { ConfigurationComponent } from './configuration/configuration.component';
import { ErrorComponent } from './static/error.component';
import { ConfigurationDialogComponent } from './configuration/configuration-dialog/configuration-dialog.component';
import { HelpComponent } from './help/help.component';

import { LibrisService } from './libris.service';

@NgModule({
  declarations: [
    AppComponent,
    MainComponent,
    TopmenuComponent,
    ConfigurationComponent,
    ErrorComponent,
    ConfigurationDialogComponent,
    HelpComponent
  ],
  imports: [
    MaterialModule,
    BrowserModule,
    BrowserAnimationsModule,
    AppRoutingModule,
    HttpClientModule,
    AlertModule,
    FormsModule,
    ReactiveFormsModule,     
    CloudAppTranslateModule.forRoot(),
  ],
  providers: [
    LibrisService,
    { provide: MAT_FORM_FIELD_DEFAULT_OPTIONS, useValue: { appearance: 'standard' } },
  ],
  bootstrap: [AppComponent],
  entryComponents: [
    ConfigurationDialogComponent
 ]
})
export class AppModule { }
