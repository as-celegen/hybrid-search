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

## Setup

### Prerequisites

- Upstash Redis Database
- Upstash Vector Database with configured Model Embedding (Semantic Search)
- Upstash Vector Database with dot product similarity metric and recommended dimension of 3072 
(For further configuration please refer to the additional notes) (Full Text Search)

### Configuration

Environment variables should be set for the server to work properly. URLs and tokens should be obtained from the upstash vector and upstash redis dashboards.

```env
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

FULL_TEXT_SEARCH_VECTOR_INDEX_URL=
FULL_TEXT_SEARCH_VECTOR_INDEX_TOKEN=

SEMANTIC_SEARCH_VECTOR_INDEX_URL=
SEMANTIC_SEARCH_VECTOR_INDEX_TOKEN=
```

### Deployment

#### Vercel

Deploying to Vercel is the easiest way to deploy the server. You can deploy the server by clicking the button below.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/project?template=)

#### Local Deployment

To deploy the server manually, you can clone the repository and deploy it to your preferred platform.

```bash
git clone
cd hybrid-search
npm install
npm run build
npm start
```


## Basic Usage

Note: For simplicity hybrid search server will use the same token as the vector database for semantic search.

```ts
import { Index } from "@upstash/vector";

type Metadata = {
  genre: 'sci-fi' | 'fantasy' | 'horror' | 'action'
  category: "classic" | "modern"
}

const index = new Index<Metadata>({
  url: "<HYBRID_SEARCH_REST_URL>",
  token: "<UPSTASH_VECTOR_REST_TOKEN>",
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

Following endpoints are implemented and they are compatible with upstash vector endpoints.

- upsert-data
- query-data
- delete
- fetch
- range
- reset
- info
- list-namespaces
- delete-namespace

Endpoints which can return vectors will return semantic embedding vectors is includeVectors field is set to true.

## Additional Notes

- Default algorithm used for combining full-text search and semantic search results is reciprocal rank fusion.
Standard Normalization and Min-Max Normalization are implemented and they can be used by setting the
'HYBRID_SEARCH_ALGORITHM' environment variable to 'STANDARD_NORMALIZATION' or 'MIN_MAX_NORMALIZATION' respectively.
- Full text search vector index dimension should be; higher if number of queries will be relatively higher than the number of documents or lower if number of queries will be relatively lower than the number of documents.

