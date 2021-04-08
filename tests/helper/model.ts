import { assert } from "chai";
import { iterateBFS } from "./util";

export class Model<E> {
	private readonly _predicates = new Set<Predicate<E>>();
	private readonly _implications = new Map<Predicate<E>, Set<Predicate<E>>>();
	private readonly _elements = new Map<Predicate<E>, Set<E>>();

	private _addPredicate(pred: Predicate<E>): void {
		this._predicates.add(pred);
		this._predicates.add(pred.not());
	}

	private _addImplication(antecedent: Predicate<E>, consequent: Predicate<E>): void {
		let set = this._implications.get(antecedent);
		if (set === undefined) {
			set = new Set();
			this._implications.set(antecedent, set);
		}
		set.add(consequent);
	}
	implication(antecedent: Predicate<E>, consequent: Predicate<E>): void {
		this._addPredicate(antecedent);
		this._addPredicate(consequent);

		this._addImplication(antecedent, consequent);
		this._addImplication(consequent.not(), antecedent.not());
	}

	equivalence(a: Predicate<E>, b: Predicate<E>): void {
		this.implication(a, b);
		this.implication(b, a);
	}

	private _addElements(pred: Predicate<E>, elements: Iterable<E>): void {
		this._addPredicate(pred);

		let set = this._elements.get(pred);
		if (set === undefined) {
			set = new Set();
			this._elements.set(pred, set);
		}

		for (const e of elements) {
			set.add(e);
		}
	}
	add(predicates: Predicate<E> | Iterable<Predicate<E>>, elements: Iterable<E>): void {
		if (predicates instanceof Predicate) {
			this._addElements(predicates, elements);
		} else {
			elements = [...elements];
			for (const p of predicates) {
				this._addElements(p, elements);
			}
		}
	}

	getTrue(predicate: Predicate<E>): ReadonlySet<E> {
		return this._getFalse(predicate.not());
	}
	private _getFalse(predicate: Predicate<E>): ReadonlySet<E> {
		const result = new Set<E>();

		for (const p of iterateBFS([predicate], p => this._implications.get(p) ?? [])) {
			const elements = this._elements.get(p.not());
			if (elements) {
				for (const e of elements) {
					result.add(e);
				}
			}
		}

		return result;
	}

	getPredicates(): ReadonlySet<Predicate<E>> {
		return this._predicates;
	}
}

export class Predicate<E> {
	readonly name: string;
	readonly eval: (element: E) => boolean;
	private _not?: Predicate<E>;

	constructor(name: string, evaluate: (element: E) => boolean) {
		this.name = name;
		this.eval = evaluate;
	}

	not(): Predicate<E> {
		if (this._not) {
			return this._not;
		} else {
			const not = new Predicate<E>(`not (${this.name})`, e => !this.eval(e));
			not._not = this;
			this._not = not;
			return not;
		}
	}
}

export function testModel<E>(model: Model<E>, stringify: (e: E) => string): void {
	for (const p of model.getPredicates()) {
		describe(p.name, function () {
			for (const element of model.getTrue(p)) {
				it(stringify(element), function () {
					assert.isTrue(p.eval(element));
				});
			}
		});
	}
}
