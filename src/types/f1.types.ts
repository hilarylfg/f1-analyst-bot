export interface Driver {
    driverId: string;
    givenName: string;
    familyName: string;
    nationality: string;
}

export interface DriverStats {
    id: string;
    name: string;
    wins: number;
    podiums: number;
    championships: number;
}