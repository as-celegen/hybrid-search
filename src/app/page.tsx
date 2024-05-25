'use client';

import SearchBox from "@/components/search-box";
import {useEffect, useState} from "react";
import {Index, QueryResult} from '@upstash/vector';
import Link from 'next/link';

interface SampleMetadata extends Record<string, unknown>{
    path: string;
    filename: string;
    dirpath: string;
    preview: string;
}

export default function Home() {
    let index: Index<SampleMetadata>;
    if(typeof window !== 'undefined') {
        index = new Index({
            url: window.location.origin,
            token: 'placeholder-token',
        });
    }
    const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const namespace = e.currentTarget.querySelector('select')?.value;
        const data = e.currentTarget.querySelector('input')?.value;
        if (!data) {
            return;
        }
        index.query<SampleMetadata>({
            data,
            includeVectors: false,
            includeMetadata: true,
            topK: 10,
        }, {namespace}).then((results) => {
            setResults(results);
        });
    };
    const [namespaces, setNamespaces] = useState<string[]>([]);
    const [results, setResults] = useState<QueryResult<SampleMetadata>[]>([]);

    useEffect(() => {
        index.listNamespaces().then((namespaces) => {
            setNamespaces(namespaces);
        });
    }, []);

    return (
        <main className="flex min-h-screen flex-col items-center p-24 bg-gray-700">
            <SearchBox onSubmit={onSubmit} namespaces={namespaces}/>
            <div className="mt-6">
                {results.map((result) => (
                    <div key={result.id}>
                        <Link key={result.id} href={`${process.env.NEXT_PUBLIC_ROOT_URL}${result.metadata?.path}`}>
                            <h2>{result.metadata?.path}</h2>
                        </Link>
                        <p>{result.metadata?.preview}</p>
                    </div>
                ))}
            </div>
        </main>
  );
}
