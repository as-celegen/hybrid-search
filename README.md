# Hybrid Search Server

> [!NOTE]  
> **This project is a Community Project.**
>
> The project is maintained and supported by the community. Upstash may contribute but does not officially support or assume responsibility for it.


## Introduction

Hybrid Search Server is a search server developed with Next.js, that combines search results from full-text search and semantic search. 
It uses upstash redis and upstash vector to provide full-text search and semantic search capabilities.
Server endpoints are compatible with the endpoints of the upstash vector with few exceptions. 
This allows the usage of upstash vector SDKs for doing necessary operations like indexing, searching, and managing the data.

## Highlights

- Full-text search and semantic search capabilities
- Easy to use and integrate with existing applications
- Supports metadata filtering
- Supports namespaces for multi-tenancy
- BM25 algorithm for full-text search
- Type compatibility with upstash vector SDKs

## Motivation

Full-text search and semantic search have their own strengths and weaknesses.
Hybrid search aims to combine their strengths to overcome their weaknesses.

By combining full-text search and semantic search results; we can provide more relevant results for the queries that are semantically similar but phrased differently or for the queries that are exactly the same but have different meanings.

## Background

Full-text search and semantic search are two different search techniques that are used to search for information in a database.

Full-text search is a technique used to search for exact matches of words or phrases in a database. 
BM25 algorithm is used in this project as the ranking algorithm for full-text search. 
BM25 calculates score based on the frequency of the term in the document, length of the document and frequency of the term in the whole collection.
Biggest problem with full-text search is that it can't understand the meaning of the words, so it can't provide relevant results for the queries that are semantically similar but phrased differently

Semantic search is a technique used to search for information based on the meaning of the words.
It uses semantic embeddings to represent the meaning of the words in a vector space.
Various similarity metrics can be used to calculate the similarity between the vectors.
In this project, model embedding feature of upstash vector is used to provide semantic search capabilities.
Model embedding is a feature that allows you to use pre-trained models to generate embedding vectors for given text data.
Biggest problem with semantic search is that it can estimate higher similarity between the vectors of the words that are semantically similar, compared to the vectors of the words that are exactly the same.

Multiple algorithms have been implemented to combine full-text search and semantic search results.
Default algorithm in this project is reciprocal rank fusion which takes the ranks of the documents from full-text search and semantic search results and combines them to provide a new rank for the documents.

## Setup

### Prerequisites

- Upstash Redis Database
- Upstash Vector Database with configured Model Embedding for Semantic Search
- Upstash Vector Database with dot product similarity metric and recommended dimension of 3072 for Full Text Search

### Configuration

Environment variables should be set for the server to work properly. URLs and tokens should be obtained from the upstash vector and upstash redis dashboards.
For further configuration please refer to the additional notes.

```env
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

FULL_TEXT_SEARCH_VECTOR_INDEX_URL=
FULL_TEXT_SEARCH_VECTOR_INDEX_TOKEN=

SEMANTIC_SEARCH_VECTOR_INDEX_URL=
SEMANTIC_SEARCH_VECTOR_INDEX_TOKEN=
```

#### Optional Configuration
- Default algorithm used for combining full-text search and semantic search results is reciprocal rank fusion.
  Standard Normalization and Min-Max Normalization are implemented and they can be used by setting the
  'HYBRID_SEARCH_ALGORITHM' environment variable to 'STANDARD_NORMALIZATION' or 'MIN_MAX_NORMALIZATION' respectively.
- Read Only Token can be set to restrict the access to the server. If set, requests that require write access will be rejected. (delete, delete-namespace, reset, upsert, upsert-data, update)
```env
HYBRID_SEARCH_ALGORITHM=RECIPROCAL_RANK_FUSION
READ_ONLY_TOKEN=
```

### Deployment

#### Vercel

Deploying to Vercel is the easiest way to deploy the server. You can deploy the server by clicking the button below.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fupstash%2Fhybrid-search&env=UPSTASH_REDIS_REST_URL,UPSTASH_REDIS_REST_TOKEN,FULL_TEXT_SEARCH_VECTOR_INDEX_URL,FULL_TEXT_SEARCH_VECTOR_INDEX_TOKEN,SEMANTIC_SEARCH_VECTOR_INDEX_URL,SEMANTIC_SEARCH_VECTOR_INDEX_TOKEN&project-name=hybrid-search-server)

#### Local Deployment

To deploy the server manually, you can clone the repository and deploy it to your preferred platform.

```bash
git clone https://github.com/upstash/hybrid-search
cd hybrid-search
npm install
npm run build
npm start
```


## Basic Usage

Hybrid search server provides endpoints that are compatible with the upstash vector endpoints. 
This allows usage of upstash vector SDKs to interact with the server. 

See the usage of [APIs](https://upstash.com/docs/vector/api/endpoints).

HYBRID_SEARCH_REST_URL below should be the URL of the hybrid search server deployment.
For simplicity hybrid search server will use the same token as the vector database for semantic search.

```ts
import { Index } from "@upstash/vector";

type Metadata = {
  genre: 'sci-fi' | 'fantasy' | 'horror' | 'action'
  category: "classic" | "modern"
}

const index = new Index<Metadata>({
  url: "<HYBRID_SEARCH_REST_URL>",
  token: "<SEMANTIC_SEARCH_VECTOR_REST_TOKEN>",
});

//Upsert Data
await index.upsert(
  [{
    id: 'upstash-rocks',
    data: 'Lord of the Rings',
    metadata: {
      genre: 'fantasy',
      category: 'classic'
    }
  }],
  {
    namespace: "example-namespace"
  }
)

//Query Data
const results = await index.query<Metadata>(
  {
    data: 'Lord of the Rings',
    includeMetadata: true,
    topK: 1,
    filter: "genre = 'fantasy'"
  },
  {
    namespace: "example-namespace"
  }
)

//Delete record
await index.delete("upstash-rocks", {namespace: "example-namespace"});

//Delete many by id
await index.delete(["id-1", "id-2", "id-3"]);

//Fetch records by their IDs
await index.fetch(["id-1", "id-2"], {namespace: "example-namespace"});

//Reset index
await index.reset();

//Info about index
await index.info();

//List existing namesapces
await index.listNamespaces();

//Delete a namespace
await index.deleteNamespace("namespace-to-be-deleted");
```

## API Reference

Following endpoints are implemented, and they are compatible with upstash vector endpoints.

- upsert-data: Upsert data to the index
- query-data: Query data by its data field
- update: Update a record by its ID
- delete: Delete a record by its ID
- fetch: Fetch records by their IDs
- range: Iterate over the records in the index
- reset: Reset the index
- info: Get information about the index
- list-namespaces: List existing namespaces
- delete-namespace: Delete namespace from the database

Endpoints which can return vectors will return semantic embedding vectors if includeVectors field is set to true.

## Demo App

### Configuration

Environment variables should be set for the demo app to work properly. 
If READ_ONLY_TOKEN is set in the env variables, NEXT_PUBLIC_READ_ONLY_TOKEN should be set to READ_ONLY_TOKEN value.

```env
NEXT_PUBLIC_READ_ONLY_TOKEN=
```

### Indexing

Indexing can be done by using the Rest API or by using the SDKs provided by upstash vector.

## Additional Notes

- Full text search vector index dimension will represent the number of unique words in the collection. If the number of unique words in the collection is less than configured dimension, server will start dividing vectors into multiple parts and will add padding to end of last vector.

  - If number of queries is expected to be high, it is recommended to set the dimension to a higher value for minimizing the request count.

  - If number of documents is expected to be high, it is recommended to set the dimension to a lower value for minimizing the storage cost of paddings in the end of vectors.
