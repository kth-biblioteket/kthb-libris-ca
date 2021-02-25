import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AppService } from '../app.service';

@Component({
  selector: 'app-help',
  templateUrl: './help.component.html',
  styleUrls: ['./help.component.scss']
})
export class HelpComponent implements OnInit {
  route: Router;
  title: String;

  constructor(private router: Router, private appService: AppService) { 
    this.route = router; 
  }

  ngOnInit() {
  }

}
