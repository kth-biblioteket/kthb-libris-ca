export interface LibrisItem { 
    index: number;
    title: string;
    librisinstance: boolean;
    librisinstancelink: string;
    librisholdings: LibrisHolding[];
    errormessage: string;
}

export interface LibrisHolding {
    sigel: string;
    shelves: Shelve[];
    otherinfo: string;
    link: string;
 }

 export interface Shelve {
    name: string;
 }