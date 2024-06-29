import {FetchResult, Index, IndexConfig, InfoResult, QueryResult, RangeResult} from "@upstash/vector";
import {
    CommandOptions,
    DeleteCommandPayload, FetchCommandOptions,
    FetchCommandPayload, IndexFunctions,
    QueryCommandPayload, RangeCommandPayload, UpdateCommandPayload,
    UpsertCommandPayload
} from "@/types/vector";

export abstract class SearchIndex<Metadata extends Record<string, unknown> = Record<string, unknown>> implements IndexFunctions<Metadata>{
    protected abstract searchType: string;
    private index: IndexFunctions<Metadata>;
    private addSearchTypeToNamespace = (namespace: string): string => namespace + '%20' + this.searchType;
    private checkNamespace = (namespace: string): boolean => namespace.endsWith(' ' + this.searchType);
    private clearNamespace = (namespace: string): string => namespace.replace(' ' + this.searchType, '');

    constructor(configOrIndex: IndexConfig | IndexFunctions<Metadata>) {
        if('upsert' in configOrIndex){
            this.index = configOrIndex;
        } else {
            this.index = new Index(configOrIndex);
        }
    }

    async delete(args: DeleteCommandPayload, options?: CommandOptions): Promise<{deleted: number}>{
        return await this.index.delete(args, {namespace: this.addSearchTypeToNamespace(options?.namespace ?? "")});
    }
    async query<TMetadata extends Record<string, unknown> = Metadata>(args: QueryCommandPayload, options?: CommandOptions): Promise<QueryResult<TMetadata>[]>{
        return await this.index.query(args, {namespace: this.addSearchTypeToNamespace(options?.namespace ?? "")});
    }
    async queryMany<TMetadata extends Record<string, unknown> = Metadata>(args: QueryCommandPayload[], options?: CommandOptions): Promise<QueryResult<TMetadata>[][]>{
        return await this.index.queryMany(args, {namespace: this.addSearchTypeToNamespace(options?.namespace ?? "")});
    }
    async upsert<TMetadata extends Record<string, unknown> = Metadata>(args: UpsertCommandPayload<TMetadata>, options?: CommandOptions): Promise<string>{
        return await this.index.upsert<Record<string, unknown>>(args, {namespace: this.addSearchTypeToNamespace(options?.namespace ?? "")});
    }
    async update<TMetadata extends Record<string, unknown> = Metadata>(args: UpdateCommandPayload<TMetadata>, options?: CommandOptions): Promise<{updated: number}>{
        return await this.index.update<Record<string, unknown>>(args, {namespace: this.addSearchTypeToNamespace(options?.namespace ?? "")});
    }
    async fetch<TMetadata extends Record<string, unknown> = Metadata>(args: FetchCommandPayload, options?: FetchCommandOptions): Promise<FetchResult<TMetadata>[]>{
        return await this.index.fetch(args, {...options, namespace: this.addSearchTypeToNamespace(options?.namespace ?? "")});
    }
    async reset(options?:CommandOptions): Promise<string>{
        return await this.index.reset({namespace: this.addSearchTypeToNamespace(options?.namespace ?? "")});
    }
    async range<TMetadata extends Record<string, unknown> = Metadata>(args: RangeCommandPayload, options?: CommandOptions): Promise<RangeResult<TMetadata>>{
        return await this.index.range(args, {namespace: this.addSearchTypeToNamespace(options?.namespace ?? "")});
    }
    async info(): Promise<InfoResult>{
        const info = await this.index.info();
        info.namespaces = Object.entries(info.namespaces).reduce((acc, entry) => {
            if (this.checkNamespace(entry[0])) {
                acc[this.clearNamespace(entry[0])] = entry[1];
            }
            return acc;
        }, {} as InfoResult["namespaces"]);
        return info;
    }

    async listNamespaces(): Promise<string[]> {
        return Array.from(new Set((await this.index.listNamespaces()).filter(a => this.checkNamespace(a)).map((namespace) => this.clearNamespace(namespace))));
    }

    async deleteNamespace(namespace: string): Promise<string> {
        return await this.index.deleteNamespace(this.addSearchTypeToNamespace(namespace));
    }

    static fromEnv<T extends SearchIndex>(
        this: new (config: IndexConfig) => T,
        config?: Omit<IndexConfig, "url" | "token">
    ): T {
        const url = process?.env.UPSTASH_VECTOR_REST_URL;
        if (!url) {
            throw new Error(
                "Unable to find environment variable: `UPSTASH_VECTOR_REST_URL`"
            );
        }
        const token = process?.env.UPSTASH_VECTOR_REST_TOKEN;
        if (!token) {
            throw new Error(
                "Unable to find environment variable: `UPSTASH_VECTOR_REST_TOKEN`"
            );
        }
        return new this({ ...config, url, token });
    }
}
