import { Component } from '@angular/core';
import { AppService } from '../app.service';

@Component({
  selector: 'app-help',
  templateUrl: './help.component.html',
  styleUrls: ['./help.component.scss']
})
export class HelpComponent {

  constructor(private appService: AppService) { }

}
