export class LibrisSigelTemplate {
    id: number;
    sigel: string;
    libraryname: string;

    constructor(sigel?: string, libraryname?: string) {
        this.sigel = sigel || '';
        this.libraryname = libraryname || '';
        this.id = Math.floor(Math.random()*(100000-1+1)+1);//'Unique' id
    }

    public toString(): string {
        return 'id: ' + this.id
            + ' sigel: ' + this.sigel
            + ' libraryname: ' + this.libraryname
            ;
    }

}