import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
	vi.resetModules();
});

// Without vitest globals, testing-library cannot register its own cleanup.
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function answers(body: unknown) {
	return vi.fn(() =>
		Promise.resolve(
			new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }),
		),
	);
}

describe('Operators', () => {
	it('lists what the room has', async () => {
		vi.stubGlobal('fetch', answers({ operators: [{ email: 'mika@example.com', addedAt: 0 }] }));
		const { Operators } = await import('./operators');
		render(<Operators roomId="keynote" />);

		expect(await screen.findByText('mika@example.com')).toBeTruthy();
		expect(screen.getByLabelText('Remove mika@example.com')).toBeTruthy();
	});

	it('marks an address the worker would refuse, once the field is left', async () => {
		vi.stubGlobal('fetch', answers({ operators: [] }));
		const { Operators } = await import('./operators');
		render(<Operators roomId="keynote" />);

		const field = await screen.findByLabelText('Operator email');
		fireEvent.change(field, { target: { value: 'nonsense' } });
		expect(field.getAttribute('aria-invalid')).toBe('false');

		fireEvent.blur(field);
		expect(field.getAttribute('aria-invalid')).toBe('true');
		expect(screen.getByRole('button', { name: 'Add' }).hasAttribute('disabled')).toBe(true);

		fireEvent.change(field, { target: { value: 'someone@example.com' } });
		expect(field.getAttribute('aria-invalid')).toBe('false');
		expect(screen.getByRole('button', { name: 'Add' }).hasAttribute('disabled')).toBe(false);
	});

	it('stops spinning when the list will not come', async () => {
		vi.stubGlobal('fetch', () =>
			Promise.resolve(
				new Response(JSON.stringify({ error: 'no such room' }), {
					status: 404,
					headers: { 'content-type': 'application/json' },
				}),
			),
		);
		const { Operators } = await import('./operators');
		const { container } = render(<Operators roomId="keynote" />);

		expect((await screen.findByRole('alert')).textContent).toBe('no such room');
		expect(container.querySelector('.loading')).toBeNull();
	});

	it('asks nothing about a scratch room, which can hold no operators', async () => {
		const fetch = answers({});
		vi.stubGlobal('fetch', fetch);
		const { Operators } = await import('./operators');
		render(<Operators roomId="scratch-load" />);

		expect(await screen.findByText('A scratch room has none, and takes none.')).toBeTruthy();
		expect(screen.queryByLabelText('Operator email')).toBeNull();
		expect(fetch).not.toHaveBeenCalled();
	});
});
