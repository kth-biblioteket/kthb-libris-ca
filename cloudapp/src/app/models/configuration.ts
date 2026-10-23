import { LibrisSigelTemplate } from "./libris-sigel-template";


export class Configuration {
  LibrisSigelTemplate: LibrisSigelTemplate[] = [];
  proxyUrl: String = '';
  librisUrl: String = '';
  //852-delfält som visas på raderna i kortet och som finns i formulären (Lägg till/Redigera). Saknas de gäller standard.
  displayFields: string[] = [];
  formFields: string[] = [];
}