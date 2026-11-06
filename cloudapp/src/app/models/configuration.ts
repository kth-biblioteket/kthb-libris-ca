import { LibrisSigelTemplate } from "./libris-sigel-template";


export class Configuration {
  LibrisSigelTemplate: LibrisSigelTemplate[] = [];
  proxyUrl: String = '';
  librisUrl: String = '';
  //Libris Login (inloggning med eget konto, direktanrop utan proxy)
  loginUrl: String = '';
  clientId: String = '';
  //Adress som Libris Login skickar tillbaka till. Tom = appens egen callback-sida. Beta pekar på produktionens.
  redirectUri: String = '';
  //852-delfält som visas på raderna i kortet och som finns i formulären (Lägg till/Redigera). Saknas de gäller standard.
  displayFields: string[] = [];
  formFields: string[] = [];
}