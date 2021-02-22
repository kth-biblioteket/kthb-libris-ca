import {Component, Inject, OnInit} from '@angular/core';
import {MAT_DIALOG_DATA, MatDialogRef} from "@angular/material/dialog";
import { LibrisSigelTemplate} from "../../models/libris-sigel-template";

@Component({
  selector: 'app-configuration-dialog',
  templateUrl: './configuration-dialog.component.html',
  styleUrls: ['./configuration-dialog.component.scss']
})
export class ConfigurationDialogComponent implements OnInit {

  showExample: boolean = false;
  testlink: string = '';
  readyForSaving: boolean = false;

  constructor(
      public dialogRef: MatDialogRef<ConfigurationDialogComponent>,
      @Inject(MAT_DIALOG_DATA) public data: LibrisSigelTemplate)
  {}

  onCloseClick(): void {
    this.dialogRef.close();
  }

  ngOnInit(): void {
  }

  onChange() {
    this.readyForSaving =this.data.sigel != ''
    console.log("change" + this.data.sigel)
  }

  toggleShowExample() {
    this.showExample = !this.showExample;
  }
}