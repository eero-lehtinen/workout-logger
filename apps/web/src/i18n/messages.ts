/**
 * The shape of an English message tree with any text in it: what a
 * translation must fill, key for key, with nothing extra.
 */
export type Messages<T> = {
  readonly [K in keyof T]: T[K] extends string ? string : Messages<T[K]>;
};
