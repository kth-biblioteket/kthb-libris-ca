import { Injectable } from '@angular/core';

/**
 * Inloggning mot Libris Login (OAuth2 implicit flow) via popup.
 * Token hålls bara i minnet.
 */
@Injectable({
  providedIn: 'root'
})
export class LibrisAuthService {
  private token: string = '';
  private expiresAt: number = 0;

  defaultRedirectUri(): string {
    return new URL('assets/oauth-callback.html', document.baseURI).href;
  }

  isLoggedIn(): boolean {
    return !!this.token && Date.now() < this.expiresAt;
  }

  getToken(): string {
    return this.isLoggedIn() ? this.token : '';
  }

  minutesLeft(): number {
    return this.isLoggedIn() ? Math.round((this.expiresAt - Date.now()) / 60000) : 0;
  }

  logout() {
    this.token = '';
    this.expiresAt = 0;
  }

  /**
   * Loggar ut ur appen och avslutar sessionen hos Libris Login (annars loggas man in direkt vid nästa inloggning).
   * Måste anropas direkt från ett klick, annars blockeras popupen.
   */
  logoutEverywhere(loginUrl: string) {
    this.logout();
    if (!loginUrl) { return; }
    const popup = window.open(loginUrl.replace(/\/+$/, '') + '/logout/', 'libislogout', 'width=480,height=400');
    if (popup) {
      setTimeout(() => { try { popup.close(); } catch (e) { } }, 2500);
    }
  }

  /** Måste anropas direkt från ett klick, annars blockeras popupen. */
  login(loginUrl: string, clientId: string, redirectUri?: string): Promise<void> {
    const state = Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-');
    const url = loginUrl.replace(/\/+$/, '') + '/oauth/authorize'
      + '?client_id=' + encodeURIComponent(clientId)
      + '&response_type=token'
      + '&scope=' + encodeURIComponent('read write')
      + '&redirect_uri=' + encodeURIComponent(redirectUri || this.defaultRedirectUri())
      + '&state=' + encodeURIComponent(state);
    const popup = window.open(url, 'librislogin', 'width=520,height=700');
    if (!popup) {
      return Promise.reject(new Error('Popup blocked'));
    }
    return new Promise<void>((resolve, reject) => {
      const finish = (err?: Error) => {
        window.removeEventListener('message', onMessage);
        clearInterval(timer);
        err ? reject(err) : resolve();
      };
      const onMessage = (ev: MessageEvent) => {
        const d = ev.data;
        if (ev.source !== popup || !d || d.type !== 'libris-auth') { return; }
        if (d.state !== state) { return finish(new Error('State mismatch')); }
        if (!d.access_token) { return finish(new Error(d.error_description || d.error || 'No token')); }
        this.token = d.access_token;
        this.expiresAt = Date.now() + (parseInt(d.expires_in, 10) || 3600) * 1000;
        finish();
      };
      window.addEventListener('message', onMessage);
      const timer = setInterval(() => { if (popup.closed) { finish(new Error('Login cancelled')); } }, 500);
    });
  }
}
