export namespace analysis {
	
	export class RecurringPayment {
	    pattern: string;
	    example: string;
	    count: number;
	    amount: number;
	    firstDate: string;
	    lastDate: string;
	    medianDays: number;
	
	    static createFrom(source: any = {}) {
	        return new RecurringPayment(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.pattern = source["pattern"];
	        this.example = source["example"];
	        this.count = source["count"];
	        this.amount = source["amount"];
	        this.firstDate = source["firstDate"];
	        this.lastDate = source["lastDate"];
	        this.medianDays = source["medianDays"];
	    }
	}
	export class Counterparty {
	    name: string;
	    count: number;
	    amount: number;
	    in: number;
	    out: number;
	
	    static createFrom(source: any = {}) {
	        return new Counterparty(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.count = source["count"];
	        this.amount = source["amount"];
	        this.in = source["in"];
	        this.out = source["out"];
	    }
	}
	export class CategoryTotal {
	    name: string;
	    amount: number;
	    count: number;
	    percent: number;
	
	    static createFrom(source: any = {}) {
	        return new CategoryTotal(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.amount = source["amount"];
	        this.count = source["count"];
	        this.percent = source["percent"];
	    }
	}
	export class BalancePoint {
	    time: string;
	    balance: number;
	
	    static createFrom(source: any = {}) {
	        return new BalancePoint(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.time = source["time"];
	        this.balance = source["balance"];
	    }
	}
	export class CashflowBucket {
	    label: string;
	    start: string;
	    in: number;
	    out: number;
	
	    static createFrom(source: any = {}) {
	        return new CashflowBucket(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.label = source["label"];
	        this.start = source["start"];
	        this.in = source["in"];
	        this.out = source["out"];
	    }
	}
	export class Totals {
	    totalIn: number;
	    totalOut: number;
	    totalFees: number;
	    net: number;
	    openingBalance: number;
	    closingBalance: number;
	    count: number;
	
	    static createFrom(source: any = {}) {
	        return new Totals(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.totalIn = source["totalIn"];
	        this.totalOut = source["totalOut"];
	        this.totalFees = source["totalFees"];
	        this.net = source["net"];
	        this.openingBalance = source["openingBalance"];
	        this.closingBalance = source["closingBalance"];
	        this.count = source["count"];
	    }
	}
	export class AnalysisResult {
	    totals: Totals;
	    cashflowDaily: CashflowBucket[];
	    cashflowWeekly: CashflowBucket[];
	    cashflowMonthly: CashflowBucket[];
	    balanceSeries: BalancePoint[];
	    categories: CategoryTotal[];
	    topCounterparties: Counterparty[];
	    recurring: RecurringPayment[];
	
	    static createFrom(source: any = {}) {
	        return new AnalysisResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.totals = this.convertValues(source["totals"], Totals);
	        this.cashflowDaily = this.convertValues(source["cashflowDaily"], CashflowBucket);
	        this.cashflowWeekly = this.convertValues(source["cashflowWeekly"], CashflowBucket);
	        this.cashflowMonthly = this.convertValues(source["cashflowMonthly"], CashflowBucket);
	        this.balanceSeries = this.convertValues(source["balanceSeries"], BalancePoint);
	        this.categories = this.convertValues(source["categories"], CategoryTotal);
	        this.topCounterparties = this.convertValues(source["topCounterparties"], Counterparty);
	        this.recurring = this.convertValues(source["recurring"], RecurringPayment);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	
	

}

export namespace parser {
	
	export class Transaction {
	    id: string;
	    date: string;
	    description: string;
	    status: string;
	    amount: number;
	    balance: number;
	
	    static createFrom(source: any = {}) {
	        return new Transaction(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.date = source["date"];
	        this.description = source["description"];
	        this.status = source["status"];
	        this.amount = source["amount"];
	        this.balance = source["balance"];
	    }
	}

}

