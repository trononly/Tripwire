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

