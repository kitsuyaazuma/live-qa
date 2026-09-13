import { useState } from 'react';
import { Page } from './page';

export function TokenGate({
	rejected,
	onToken,
}: {
	rejected: boolean;
	onToken: (token: string) => void;
}) {
	const [value, setValue] = useState('');

	return (
		<Page width="max-w-sm">
			<form
				className="grow"
				onSubmit={(event) => {
					event.preventDefault();
					if (value.trim()) onToken(value.trim());
				}}
			>
				<fieldset className="fieldset bg-base-100 border-base-300 rounded-box min-w-0 border p-4">
					<legend className="fieldset-legend">Moderator token</legend>
					<input
						type="password"
						className={`input w-full ${rejected ? 'input-error' : ''}`}
						value={value}
						autoComplete="current-password"
						onChange={(event) => setValue(event.target.value)}
					/>
					<p className="label text-xs whitespace-normal">
						{rejected ? 'That token was refused.' : 'The token this deployment was given.'}
					</p>
					<button type="submit" className="btn btn-primary btn-sm" disabled={!value.trim()}>
						Unlock
					</button>
				</fieldset>
			</form>
		</Page>
	);
}
