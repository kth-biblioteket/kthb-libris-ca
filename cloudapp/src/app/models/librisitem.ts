export interface LibrisItem { 
    index: number;
    title: string;
    librisid: string;
    librisinstance: boolean;
    librisinstancelink: string;
    librisholdings: LibrisHolding[];
    errormessage: string;
}

export interface LibrisHolding {
    sigel: string;
    marc_852: Marc852[];
    otherinfo: string;
    link: string;
    holdingurl: string;
    etag: string;
    holdinggraph: any;
 }

 export interface Marc852 {
    '8': string;
    b: string;
    c: string;
    h: string;
    j: string;
    l: string;
    t: string;
    i: string;
    otherinfo?: string;
 }