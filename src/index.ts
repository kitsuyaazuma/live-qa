import { Hono } from 'hono';

export { Room } from './room';

const app = new Hono<{ Bindings: Env }>();

export default app;
