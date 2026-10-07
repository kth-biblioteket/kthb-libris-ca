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
import { HoldingDialogComponent } from './main/holding-dialog/holding-dialog.component';
import { AlmaDeleteDialogComponent } from './main/alma-delete-dialog/alma-delete-dialog.component';

import { LibrisService } from './libris.service';
import { AlmaService } from './alma.service';
import { HistoryService } from './history.service';
import { UndoDialogComponent } from './main/undo-dialog/undo-dialog.component';

@NgModule({
  declarations: [
    AppComponent,
    MainComponent,
    TopmenuComponent,
    ConfigurationComponent,
    ErrorComponent,
    ConfigurationDialogComponent,
    HelpComponent,
    HoldingDialogComponent,
    AlmaDeleteDialogComponent,
    UndoDialogComponent
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
    AlmaService,
    HistoryService,
    { provide: MAT_FORM_FIELD_DEFAULT_OPTIONS, useValue: { appearance: 'standard' } },
  ],
  bootstrap: [AppComponent],
  entryComponents: [
    ConfigurationDialogComponent,
    HoldingDialogComponent,
    AlmaDeleteDialogComponent,
    UndoDialogComponent
 ]
})
export class AppModule { }
