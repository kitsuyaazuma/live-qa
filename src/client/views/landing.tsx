import { useState } from 'react';
import { Host } from '../components/host';
import { Page } from '../components/page';
import { SignIn } from '../components/sign-in';
import { Anonymous, ArrowLeft, People, Presentation } from '../icons';
import { navigate } from '../router';
import { slug } from '../slug';
import { useMe } from '../use-me';

type Role = 'join' | 'host';

export function Landing() {
	const [role, setRole] = useState<Role | null>(null);
	const [name, setName] = useState('');
	const me = useMe();
	const room = slug(name);

	return (
		<Page width="max-w-xl">
			{role === null ? (
				<div className="grid gap-3 sm:grid-cols-2">
					<button
						type="button"
						className="btn h-auto flex-col gap-2 py-8"
						onClick={() => setRole('join')}
					>
						<People className="size-10" />
						<span className="text-lg">Join</span>
						<span className="text-xs font-normal opacity-70">Ask and upvote questions</span>
					</button>
					<button
						type="button"
						className="btn h-auto flex-col gap-2 py-8"
						onClick={() => setRole('host')}
					>
						<Presentation className="size-10" />
						<span className="text-lg">Host</span>
						<span className="text-xs font-normal opacity-70">Run the room and the stage</span>
					</button>
				</div>
			) : (
				<div className="flex flex-col gap-3">
					<button
						type="button"
						className="btn btn-ghost btn-sm self-start gap-1"
						onClick={() => setRole(null)}
					>
						<ArrowLeft className="size-4" />
						Back
					</button>

					{role === 'host' ? (
						me === undefined ? (
							<span className="loading loading-spinner mx-auto my-10" />
						) : me === null ? (
							<SignIn next="/" reason="Hosting takes an account." />
						) : (
							<Host me={me} />
						)
					) : (
						<form
							onSubmit={(event) => {
								event.preventDefault();
								if (room) navigate(`/r/${room}`);
							}}
						>
							<fieldset className="fieldset bg-base-100 border-base-content/25 rounded-box min-w-0 border p-4">
								<legend className="fieldset-legend">Join a room</legend>
								<input
									className="input w-full"
									placeholder="Room name, such as keynote"
									value={name}
									autoCapitalize="none"
									autoComplete="off"
									aria-label="Room name"
									aria-describedby="room-hint"
									// biome-ignore lint/a11y/noAutofocus: the field appears because a choice was just made
									autoFocus
									onChange={(event) => setName(event.target.value)}
								/>
								<p id="room-hint" className="label text-xs whitespace-normal">
									{room
										? `Everyone who types ${room} lands in the same room.`
										: 'Letters and numbers. Everyone in the room uses the same name.'}
								</p>
								<div className="rounded-field border-base-content/25 mt-2 flex items-center gap-3 border p-3">
									<div className="avatar avatar-placeholder">
										<div className="bg-base-200 text-base-content w-10 rounded-full">
											<Anonymous className="size-5" />
										</div>
									</div>
									<div>
										<p className="font-medium">Anonymous</p>
										<p className="text-xs opacity-70">No account, and nothing about you is kept.</p>
									</div>
								</div>
								<button type="submit" className="btn btn-primary mt-2 self-start" disabled={!room}>
									Join
								</button>
							</fieldset>
						</form>
					)}
				</div>
			)}
		</Page>
	);
}
