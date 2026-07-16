import { convertNxGenerator } from '@nx/devkit';
import { routeGenerator, routeSplitGenerator } from './generator.js';

export const routeSchematic = convertNxGenerator(routeGenerator);
export const routeSplitSchematic = convertNxGenerator(routeSplitGenerator);

export default routeSchematic;
