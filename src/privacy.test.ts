import { describe, expect, it } from 'vitest';
import { privacyPage } from './privacy';

function env(vars: Record<string, string>): Env {
	return vars as unknown as Env;
}

describe('privacyPage', () => {
	it('names the operator and the contact, escaped', () => {
		const html = privacyPage(
			env({ PRIVACY_OPERATOR: ' Kaigi <Ops> ', PRIVACY_CONTACT: 'ops@example.com' }),
		);

		expect(html).toContain('run by Kaigi &lt;Ops&gt;,');
		expect(html).toContain(' Ask ops@example.com for either.');
	});

	it('falls back to the organiser and skips the contact sentence when unset', () => {
		const html = privacyPage(env({ PRIVACY_OPERATOR: '', PRIVACY_CONTACT: '' }));

		expect(html).toContain('run by the organiser,');
		expect(html).not.toContain(' Ask ');
	});
});
