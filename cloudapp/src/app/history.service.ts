import { Injectable } from '@angular/core';
import { CloudAppStoreService } from '@exlibris/exl-cloudapp-angular-lib';

export interface DeletedEntry {
    id: string;
    ts: number;
    mmsId: string;
    title: string;
    librisId: string;
    sigel: string;
    libraryName: string;
    kind: 'all' | 'row';
    rows: string;          //t.ex. "h# 8f j# 6163" för en enskild rad, eller antal rader vid hela beståndet
    alma?: { deleted: number, failed: number };
    hasUndo?: boolean;                                   //fullständig information för att ångra finns sparad
    undone?: { libris?: boolean, alma?: boolean };      //vad som redan ångrats
}

/**
 * Lista över senast borttagna bestånd, sparad per användare i Alma (Cloud App Store).
 * Gör att man kan hitta posten igen via MMS ID, även när Alma inte längre visar posten i sin lista.
 */
@Injectable()
export class HistoryService {
    private readonly KEY = 'deletedHistory';
    private readonly MAX = 20;
    private readonly MAX_UNDO = 10;     //bara de senaste får full information (lagringen har en storleksgräns)

    constructor(private store: CloudAppStoreService) {}

    async list(): Promise<DeletedEntry[]> {
        try {
            const value = await this.store.get(this.KEY).toPromise();
            return Array.isArray(value) ? value : [];
        } catch (e) {
            return [];
        }
    }

    private async save(entries: DeletedEntry[]) {
        try {
            await this.store.set(this.KEY, entries.slice(0, this.MAX)).toPromise();
        } catch (e) {
            console.error('Kunde inte spara listan över borttagna poster', e);
        }
    }

    async add(entry: Omit<DeletedEntry, 'id' | 'ts'>): Promise<{ id: string, entries: DeletedEntry[] }> {
        const full: DeletedEntry = { ...entry, id: Date.now() + '-' + Math.random().toString(36).substring(2, 7), ts: Date.now() };
        const all = [full, ...(await this.list())];
        const entries = all.slice(0, this.MAX);
        //Äldre poster än de MAX som ryms och poster utöver MAX_UNDO släpper sin fullständiga information
        for (let i = 0; i < all.length; i++) {
            if ((i >= this.MAX || i >= this.MAX_UNDO) && all[i].hasUndo) {
                await this.dropSnapshot(all[i].id);
                all[i].hasUndo = false;
            }
        }
        await this.save(entries);
        return { id: full.id, entries: entries };
    }

    private snapshotKey(id: string) {
        return 'undo:' + id;
    }

    /**
     * Sparar det som behövs för att ångra (separat nyckel per post). Returnerar false om det inte gick att spara.
     */
    async saveSnapshot(id: string, snapshot: any): Promise<boolean> {
        try {
            await this.store.set(this.snapshotKey(id), snapshot).toPromise();
            return true;
        } catch (e) {
            console.error('Kunde inte spara information för att ångra', e);
            return false;
        }
    }

    /**
     * Lägger till en del (t.ex. Alma-kopian) i en redan sparad kopia
     */
    async mergeSnapshot(id: string, part: any): Promise<boolean> {
        const existing = (await this.getSnapshot(id)) || {};
        return this.saveSnapshot(id, { ...existing, ...part });
    }

    async getSnapshot(id: string): Promise<any> {
        try {
            return await this.store.get(this.snapshotKey(id)).toPromise();
        } catch (e) {
            return null;
        }
    }

    async dropSnapshot(id: string) {
        try {
            await this.store.remove(this.snapshotKey(id)).toPromise();
        } catch (e) { }
    }

    async update(id: string, changes: Partial<DeletedEntry>): Promise<DeletedEntry[]> {
        const entries = (await this.list()).map(e => e.id === id ? { ...e, ...changes } : e);
        await this.save(entries);
        return entries;
    }

    async remove(id: string): Promise<DeletedEntry[]> {
        await this.dropSnapshot(id);
        const entries = (await this.list()).filter(e => e.id !== id);
        await this.save(entries);
        return entries;
    }

    async clear(): Promise<DeletedEntry[]> {
        for (const entry of await this.list()) {
            if (entry.hasUndo) { await this.dropSnapshot(entry.id); }
        }
        await this.save([]);
        return [];
    }
}
