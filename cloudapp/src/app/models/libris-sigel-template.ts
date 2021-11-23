export class LibrisSigelTemplate {
    id: number;
    sigel: string;
    libraryname: string;
    almalibrarycode: string

    constructor(sigel?: string, libraryname?: string, almalibrarycode?: string) {
        this.sigel = sigel || '';
        this.libraryname = libraryname || '';
        this.almalibrarycode = almalibrarycode || '';
        this.id = Math.floor(Math.random()*(100000-1+1)+1);//'Unique' id
    }

    public toString(): string {
        return 'id: ' + this.id
            + ' sigel: ' + this.sigel
            + ' libraryname: ' + this.libraryname
            + ' almalibrarycode: ' + this.almalibrarycode
            ;
    }

}