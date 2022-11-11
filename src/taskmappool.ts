type semaphore_entry = { promise: Promise<void>; resolve: () => void };

export class Semaphore {
	count: number;
	pendings: semaphore_entry[] = [];

	constructor(count: number) {
		this.count = count;
	}

	async acquire() {
		while (this.pendings.length >= this.count || this.count < 0) {
			await Promise.race(this.pendings.map(({ promise }) => promise));
		}
		let resolve = () => {};
		let promise = new Promise<void>((res, _) => {
			resolve = res;
		});
		this.pendings.push({ promise: promise, resolve: resolve });
	}

	release() {
		this.pendings.shift()?.resolve();
	}
}

export class TaskMapPool<T> {
	semaphore: Semaphore;
	tasks: T[];

	constructor(count: number) {
		this.semaphore = new Semaphore(count);
		this.tasks = [];
	}

	addTask(t: T) {
		this.tasks.push(t);
	}

	addTasks(t: T[]) {
		this.tasks = this.tasks.concat(t);
	}

	async run<U>(fn: (t: T) => Promise<U>): Promise<U[]> {
		let result: U[] = [];
		for (let task of this.tasks) {
			await this.semaphore.acquire();
			result.push(await fn.apply(this, [task]));
			this.semaphore.release();
		}
		return result;
	}
}
