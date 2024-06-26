import { Index } from '@upstash/vector';

export type QueryCommandPayload = Parameters<Index['query']>[0];

export type RangeCommandPayload = Parameters<Index['range']>[0];

export type FetchCommandPayload = Parameters<Index['fetch']>[0];

export type FetchCommandOptions = Parameters<Index['fetch']>[1];

export type DeleteCommandPayload = Parameters<Index['delete']>[0];

export type UpsertCommandPayload<Metadata extends Record<string, unknown>> = Parameters<Index<Metadata>['upsert']>[0];

export type UpdateCommandPayload<TMetadata extends Record<string, unknown>> = Parameters<Index<TMetadata>['update']>[0];

export type CommandOptions = Parameters<Index['upsert']>[1];

type PickMatching<T, V> = {
    [K in keyof T]: T[K] extends V ? T[K] : never;
};
export type IndexFunctions<Metadata extends Record<string, unknown> = Record<string, unknown>> = Omit<PickMatching<Index<Metadata>, Function>, 'namespace'>;
