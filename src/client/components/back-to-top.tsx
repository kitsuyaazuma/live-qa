import { useEffect, useState } from 'react';
import { ArrowUp } from '../icons';

export function BackToTop() {
	const [shown, setShown] = useState(false);

	useEffect(() => {
		const onScroll = () => setShown(scrollY > innerHeight);
		addEventListener('scroll', onScroll, { passive: true });
		onScroll();
		return () => removeEventListener('scroll', onScroll);
	}, []);

	if (!shown) return null;
	return (
		<div className="fab">
			<button
				type="button"
				className="btn btn-lg btn-circle shadow-lg"
				aria-label="Back to the top"
				onClick={() => scrollTo({ top: 0, behavior: 'smooth' })}
			>
				<ArrowUp />
			</button>
		</div>
	);
}
