import {FetchResult, Index, IndexConfig, InfoResult, QueryResult, RangeResult, Vector} from "@upstash/vector";
import {
    CommandOptions,
    DeleteCommandPayload,
    FetchCommandPayload, IndexFunctions,
    QueryCommandPayload, RangeCommandPayload,
    UpsertCommandPayload
} from "@/types/vector";


export class BigIndex<Metadata extends Record<string, unknown> = Record<string, unknown>> implements IndexFunctions<Metadata>{
    private dimension: number = 0;
    private index: IndexFunctions<Metadata>;
    private namespacePartitions: Record<string, number> = {};

    private addPartitionInfoToNamespace = (namespace: string, partition: number | string): string => partition === 0 ? namespace : namespace + '.' + partition + '.BigIndex';
    private checkNamespace = (namespace: string): boolean => namespace.endsWith('.BigIndex');
    private clearNamespace = (namespace: string): string => namespace.replace(/\.\d*\.BigIndex$/, '');
    private getPartition = (namespace: string): number => parseInt(namespace.match(/\.(\d*)\.BigIndex$/)?.[1] ?? '0');


    similarityMetric: "COSINE" | "EUCLIDEAN" | "DOT_PRODUCT" = 'DOT_PRODUCT';

    constructor(configOrIndex: IndexConfig | IndexFunctions<Metadata>) {
        if('upsert' in configOrIndex){
            this.index = configOrIndex;
        } else {
            this.index = new Index(configOrIndex);
        }


        this.index.info().then(async info => {
            this.similarityMetric = info.similarityFunction;
            this.dimension = info.dimension;

            this.updateNamespacePartitions(Object.keys(info.namespaces));

            return true;
        });
    }

    async delete(args: DeleteCommandPayload, options?: CommandOptions): Promise<{ deleted: number; }> {
        const results = await Promise.all(
            Array(this.namespacePartitions[options?.namespace ?? ""] ?? 1)
                .map((_, index) => this.index.delete(args, {namespace: this.addPartitionInfoToNamespace(options?.namespace ?? "", index)}))
        );

        return {
            deleted: results.reduce((acc, result) => Math.max(acc, result.deleted), 0)
        };
    }

    async query<TMetadata extends Record<string, unknown> = Metadata>(args: QueryCommandPayload, options?: CommandOptions): Promise<QueryResult<TMetadata>[]> {
        if(this.dimension === 0){
            return [];
        }
        if('data' in args){
            return await this.index.query<TMetadata>(args);
        }

        const argsArray: Record<number, QueryCommandPayload> = {};
        for(let i = 0; i < Math.ceil(args.vector.length/this.dimension); i++){
            let vector = args.vector.slice(i * this.dimension, (i + 1) * this.dimension);
            if(vector.length === 0 || vector.every((value) => value === 0)){
                continue;
            }
            if(vector.length < this.dimension){
                vector = vector.concat(Array(this.dimension - vector.length).fill(0));
            }
            argsArray[i] = {
                ...args,
                vector,
            };
        }
        const results = await Promise.all(
            Object.entries(argsArray)
                .map(arg => this.index.query<TMetadata>(arg[1], {namespace: this.addPartitionInfoToNamespace(options?.namespace ?? "", arg[0])}))
        );
        return results.reduce(this.combineResultNamespaces, []).sort((a, b) => b.score - a.score);
    }

    async upsert<TMetadata extends Record<string, unknown> = Metadata>(args: UpsertCommandPayload<TMetadata>, options?: CommandOptions): Promise<string> {
        if(this.dimension === 0 || (Array.isArray(args) && args.length === 0)){
            return 'Failed';
        }
        if((!Array.isArray(args) && 'data' in args) || (Array.isArray(args) && 'data' in args[0])){
            return await this.index.upsert<Record<string, unknown>>(args, options);
        }
        // @ts-ignore
        // Typescript does not support the key check for 'data' from above line
        const argsArray:{
            id: string | number;
            vector: number[];
            metadata?: Record<string, unknown> | undefined
        }[] | {
            id: string | number;
            vector: undefined;
            metadata: Record<string, unknown> | undefined
        }[] = Array.isArray(args) ? args : [args];
        this.namespacePartitions[options?.namespace ?? ""] = Math.max(
            this.namespacePartitions[options?.namespace ?? ""] ?? 0,
            argsArray.reduce((acc, arg) => Math.max(acc, Math.ceil((arg.vector?.length ?? 0)/this.dimension)), 0)
        );
        const partitionCount = this.namespacePartitions[options?.namespace ?? ""];
        const argsWithJustMetadata = argsArray.flatMap((arg) => arg.vector === undefined ? [arg] : []);
        const argsWithVectors = argsArray.flatMap((arg) => (arg.vector !== undefined) ? [arg] : []);
        const partitionedVectors = Array(partitionCount).map((_, index) => {
            return argsWithVectors.map((arg) => {
                let vector = arg.vector.slice(index * this.dimension, (index + 1) * this.dimension);
                if(vector.length < this.dimension){
                    vector = vector.concat(Array(this.dimension - vector.length).fill(0));
                }
                return {
                    ...arg,
                    vector,
                };
            });
        });

        const results = await Promise.all(partitionedVectors.map((vectors, index) =>{
            if(vectors.length === 0){
                return 'Success';
            }
            return this.index.upsert<Record<string, unknown>>([...vectors, ...argsWithJustMetadata], {namespace: this.addPartitionInfoToNamespace(options?.namespace ?? "", index)});
        }));
        return (results.every(result => result === 'Success')) ? 'Success' : 'Failure';
    }

    async fetch<TMetadata extends Record<string, unknown> = Metadata>([ids, opts]: FetchCommandPayload, options?: CommandOptions): Promise<FetchResult<TMetadata>[]> {
        if(opts?.includeVectors === false){
            return await this.index.fetch<TMetadata>([ids, opts], options);
        }
        const results = await Promise.all(Array(this.namespacePartitions[options?.namespace ?? ""] ?? 1)
            .map((_, index) => this.index.fetch<TMetadata>([ids, opts], {namespace: this.addPartitionInfoToNamespace(options?.namespace ?? "", index)}))
        );
        return results.reduce(this.combineNamespaces, []);
    }

    async reset(options?: CommandOptions): Promise<string> {
        return await Promise.all(Array(this.namespacePartitions[options?.namespace ?? ""] ?? 1).map(
            (_, index) => this.index.reset({namespace: this.addPartitionInfoToNamespace(options?.namespace ?? "", index)}))
        ).then(results => results.every(r => r === 'Success') ? 'Success' : 'Failure');
    }

    async range<TMetadata extends Record<string, unknown> = Metadata>(args: RangeCommandPayload, options?: CommandOptions): Promise<RangeResult<TMetadata>>  {
        if(args.includeVectors === false){
            return await this.index.range<TMetadata>(args, options);
        }
        const results = await this.index.range<TMetadata>(args, options);
        const ids = results.vectors.map((result) => result.id);

        const vectors = await Promise.all(Array(this.namespacePartitions[options?.namespace ?? ""] ?? 1)
            .map((_, index) => this.index.fetch<TMetadata>([ids, {includeVectors: true}], {namespace: this.addPartitionInfoToNamespace(options?.namespace ?? "", index)}))
        );
        return vectors.reduce((acc, result) => {
            return {
                ...acc,
                vectors: this.combineNamespaces(acc.vectors, result)
            }
        }, results);
    }

    async info(): Promise<InfoResult> {
        const info = await this.index.info();
        this.updateNamespacePartitions(Object.keys(info.namespaces));
        info.namespaces = Object.entries(info.namespaces).reduce((acc, entry) => {
            acc[this.clearNamespace(entry[0])] = entry[1];
            return acc;
        }, {} as InfoResult["namespaces"]);
        return info;
    }

    async listNamespaces(): Promise<string[]> {
        return Array.from(new Set(await this.index.listNamespaces().map((namespace) => this.clearNamespace(namespace))));
    }

    async deleteNamespace(namespace: string): Promise<string> {
        const partitions = this.namespacePartitions[namespace] ?? 1;
        return await Promise.all(Array(partitions).map((_, index) => this.index.deleteNamespace(this.addPartitionInfoToNamespace(namespace, index)))).then(results => results.every(r => r === 'Success') ? 'Success' : 'Failure');
    }

    updateNamespacePartitions(partitions: string[]){
        this.namespacePartitions = partitions.reduce((acc, entry) => {
            if (this.checkNamespace(entry[0])) {
                const namespace = this.clearNamespace(entry);
                const partition = this.getPartition(entry);
                acc[namespace] = Math.max(acc[namespace] ?? 0, partition + 1);
            } else {
                acc[entry] = 1;
            }
            return acc;
        }, {} as Record<string, number>);
    }

    private combineNamespaces<TMetadata extends Record<string, unknown> = Metadata>(fetchResult1: FetchResult<TMetadata>[], fetchResult2: FetchResult<TMetadata>[]): Vector<TMetadata>[] {
        const index1: Vector<TMetadata>[] = fetchResult1.flatMap((vector) => vector !== null ? [vector] : []);
        const index2: Vector<TMetadata>[] = fetchResult2.flatMap((vector) => vector !== null ? [vector] : []);
        if(index1.length === 0) return index2;
        const vectors: Record<string, {index: number, vectorObject: Vector<TMetadata>}> = {};
        let vectorCount = index1.length;
        const dimension1 = index1[0].vector?.length ?? 0;
        const dimension2 = index2[0].vector?.length ?? 0;
        index1.forEach((vector, index) => vectors[vector.id] = {index, vectorObject: vector});
        index2.forEach((vector) => {
            if(vectors[vector.id] === undefined){
                if(vector.vector !== undefined){
                    vector.vector = Array(dimension1).fill(0).concat(vector.vector);
                }
                vectors[vector.id] = {
                    vectorObject: vector,
                    index: vectorCount++,
                };
            } else {
                vectors[vector.id].vectorObject = this.combineVectors(vectors[vector.id].vectorObject, vector);
            }
        });
        Object.values(vectors).forEach((combinedVector) => {
            if(combinedVector.vectorObject.vector !== undefined && combinedVector.vectorObject.vector.length === dimension1){
                combinedVector.vectorObject.vector = combinedVector.vectorObject.vector.concat(Array(dimension2).fill(0));
            }
        });
        const combinedVectors = Array(vectorCount).fill(null);
        Object.values(vectors).forEach(({index, vectorObject}) => {
            combinedVectors[index] = vectorObject;
        });
        return combinedVectors;
    }

    private combineVectors<TMetadata extends Record<string, unknown> = Metadata>(vector1: Vector<TMetadata>, vector2: Vector<TMetadata>): Vector<TMetadata> {
        let metadata: TMetadata | undefined = vector2.metadata;
        return {
            id: vector1.id,
            vector: vector1 && vector2 && vector1.vector.concat(vector2.vector),
            metadata,
        };
    }

    private combineResultNamespaces<TMetadata extends Record<string, unknown> = Metadata>(index1: QueryResult<TMetadata>[], index2: QueryResult<TMetadata>[]): QueryResult<TMetadata>[] {
        if(index1.length === 0) return index2;
        const vectors: Record<string, QueryResult<TMetadata>> = {};
        const dimension1 = index1[0].vector?.length ?? 0;
        const dimension2 = index2[0].vector?.length ?? 0;
        index1.forEach((vector) => vectors[vector.id] = vector);
        index2.forEach((vector) => {
            if(vectors[vector.id] === undefined){
                if(vector.vector !== undefined){
                    vector.vector = Array(dimension1).fill(0).concat(vector.vector);
                }
                vectors[vector.id] = vector;
            } else {
                vectors[vector.id] = this.combineResultVectors(vectors[vector.id], vector);
            }
        });
        Object.values(vectors).forEach((vector) => {
            if(vector.vector !== undefined && vector.vector.length === dimension1){
                vector.vector = vector.vector.concat(Array(dimension2).fill(0));
            }
        });
        return Object.values(vectors);
    }

    private combineResultVectors<TMetadata extends Record<string, unknown> = Metadata>(vector1: QueryResult<TMetadata>, vector2: QueryResult<TMetadata>): QueryResult<TMetadata> {
        let metadata: TMetadata | undefined = vector2.metadata;
        let score = 0;
        if(this.similarityMetric === 'COSINE'){
            // Note: Recommended approach is to use the dot product similarity with the normalized vectors
            score = vector1.score + vector2.score;
        } else if(this.similarityMetric === 'EUCLIDEAN'){
            // 1/(1 + aDist + bDist) = 1/(1 + 1/aScore - 1 + 1/bScore - 1) = 1/(1 + 1/aScore + 1/bScore - 2) = 1/(1/aScore + 1/bScore - 1) = aScore * bScore / (aScore + bScore - aScore * bScore)
            score = vector1.score * vector2.score / (vector1.score + vector2.score - vector1.score * vector2.score);
        } else if(this.similarityMetric === 'DOT_PRODUCT'){
            score = vector1.score + vector2.score - 1/2;
        }
        return {
            id: vector1.id,
            vector: vector1 && vector2 && vector1.vector.concat(vector2.vector),
            metadata,
            score,
        };
    }

    static fromEnv(config?: Omit<IndexConfig, "url" | "token">): BigIndex {
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
        return new BigIndex({ ...config, url, token });
    }
}

