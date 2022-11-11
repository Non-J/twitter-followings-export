import dotenv from 'dotenv';
import { exit } from 'process';
dotenv.config();

import { TaskMapPool } from './taskmappool';
import { Client } from 'twitter-api-sdk';
import { save_json } from './file';

if (!process.env['BEARER_TOKEN']) {
	console.error('Missing bearer token.');
	process.exit(1);
}
const client = new Client(process.env['BEARER_TOKEN']);

// Stores found t.co links with the original url so that they can be replaced later.
let url_map: Record<string, string> = {};

export type user_data = {
	id: string;
	name: string;
	username: string;
	description: string;
	location: string;
	url: string | undefined;
	profile_image_url: string;
	pinned_tweet_id: string;
	public_metrics: {
		followers_count: number;
		following_count: number;
		tweet_count: number;
		listed_count: number;
	};
};

type user_data_with_pinned_tweet = user_data & { pinned_tweet?: any };

/**
 * Grab user by username.
 * In case of error, may log to error console and returns null
 */
export async function get_user_data(
	username: string,
): Promise<user_data | null> {
	// Use twitter api to get username
	const req = await client.users.findUserByUsername(username, {
		'user.fields': [
			'description',
			'location',
			'entities',
			'name',
			'public_metrics',
			'pinned_tweet_id',
			'profile_image_url',
		],
	});
	if (req.errors) {
		console.error(`Cannot get user @${username}.`);
		console.error(req.errors);
		return null;
	}

	// This case shouldn't happen?
	if (!req.data) {
		console.error(`Found user @${username} but cannot get data.`);
		exit(1);
	}

	// Get the url in the profile
	let profile_url: string | undefined;
	if (req.data.entities?.url?.urls) {
		let url = req.data.entities?.url?.urls[0];
		if (!url) {
			// This case shouldn't happen?
			console.error('Expects urls to contain 1 url, none found.');
			exit(1);
		}

		if (url.expanded_url) {
			url_map[url.url] = url.expanded_url;
			profile_url = url.expanded_url;
		}
	}

	// Add t.co urls in the description to url_map
	for (let url of req.data.entities?.description?.urls ?? []) {
		if (url.expanded_url) {
			url_map[url.url] = url.expanded_url;
		}
	}

	let { entities, ...result } = { ...req.data };
	if (profile_url) {
		result.url = profile_url;
	}
	return result as user_data;
}

/**
 * Grab list of followings from user_id.
 * In case of error, may log to error console and returns null
 */
export async function get_followings(
	user_id: string,
): Promise<user_data[] | null> {
	const req = client.users.usersIdFollowing(user_id, {
		'user.fields': [
			'description',
			'location',
			'entities',
			'name',
			'public_metrics',
			'pinned_tweet_id',
			'profile_image_url',
		],
	});

	let result: user_data[] = [];

	for await (const page of req) {
		if (page.errors) {
			console.error(`Error while trying to get followings of ${user_id}.`);
			return null;
		}

		if (page.data) {
			for (const user of page.data) {
				// Get the url in the profile
				let profile_url: string | undefined;
				if (user.entities?.url?.urls) {
					let url = user.entities?.url?.urls[0];
					if (!url) {
						// This case shouldn't happen?
						console.error('Expects urls to contain 1 url, none found.');
						exit(1);
					}

					if (url.expanded_url) {
						url_map[url.url] = url.expanded_url;
						profile_url = url.expanded_url;
					}
				}

				// Add t.co urls in the description to url_map
				for (let url of user.entities?.description?.urls ?? []) {
					if (url.expanded_url) {
						url_map[url.url] = url.expanded_url;
					}
				}

				let { entities, ...res } = { ...user };
				if (profile_url) {
					res.url = profile_url;
				}
				result.push(res as user_data);
			}
		}
	}

	return result;
}

/**
 * Grab tweet by tweet id.
 * In case of error, may log to error console and returns null
 */
export async function get_tweet(tweet_id: string): Promise<any | null> {
	const req = await client.tweets.findTweetById(tweet_id);

	if (req.errors) {
		console.error(`Cannot get tweet id ${tweet_id}`);
		console.error(req.errors);
		return null;
	}

	// This case shouldn't happen?
	if (!req.data) {
		console.error(`Found tweet (id: ${tweet_id}) but cannot get data.`);
		exit(1);
	}

	// Add t.co urls in the description to url_map
	for (let url of req.data.entities?.urls ?? []) {
		if (url.expanded_url) {
			url_map[url.url] = url.expanded_url;
		}
	}

	return req.data;
}

async function main() {
	if (!process.argv[2]) {
		console.error('Missing inital username.');
		process.exit(1);
	}
	const username = process.argv[2];

	const user_data = await get_user_data(username);
	if (!user_data) {
		exit(1);
	}

	let followings: user_data_with_pinned_tweet[] =
		(await get_followings(user_data.id)) ?? [];

	const pinned_tweet_queue = new TaskMapPool<
		[user_data_with_pinned_tweet, string]
	>(8);
	for (let following of followings) {
		pinned_tweet_queue.addTask([following, following.pinned_tweet_id]);
	}
	// await pinned_tweet_queue.run(async ([user, tweet_id]) => {
	// 	if (tweet_id) {
	// 		user.pinned_tweet = await get_tweet(tweet_id);
	// 	}
	// });

	await save_json({ followings: followings, urls: url_map });
}

main();
