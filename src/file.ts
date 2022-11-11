import { writeFile } from 'fs/promises';

function random_file_name(name: string, run_key = 4) {
	return `${name}-${(Math.random() * 10 ** run_key)
		.toFixed(0)
		.padStart(run_key, '0')}.json`;
}

export async function save_json(data: any) {
	return writeFile(random_file_name('export'), JSON.stringify(data));
}
