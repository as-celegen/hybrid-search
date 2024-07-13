'use client';

import SearchBox from "@/components/search-box";
import React, {useEffect, useMemo, useState} from "react";
import {Index, QueryResult} from '@upstash/vector';
import Link from 'next/link';

interface SampleMetadata extends Record<string, unknown>{
    path: string;
    filename: string;
    dirpath: string;
    preview: string;
}

export default function Home() {
    const [namespaces, setNamespaces] = useState<string[]>([]);
    const [results, setResults] = useState<QueryResult<SampleMetadata>[]>([]);
    const index = useMemo<Index | undefined>(() => {
        if(typeof window !== 'undefined') {
            return new Index({
                url: window.location.origin,
                token: process.env.NEXT_PUBLIC_READ_ONLY_TOKEN ?? "",
            });
        }
        return undefined;
    }, []);

    const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const namespace = e.currentTarget.querySelector('select')?.value;
        const data = e.currentTarget.querySelector('input')?.value;
        if (!data) {
            return;
        }
        index?.query<SampleMetadata>({
            data,
            includeVectors: false,
            includeMetadata: true,
            topK: 10,
        }, {namespace}).then((results) => {
            setResults(results);
        });
    };


    useEffect(() => {
        index?.listNamespaces().then((namespaces) => {
            setNamespaces(namespaces);
        });
    }, [index]);

    return (
        <main className="flex min-h-screen flex-col items-center p-24 bg-gray-700">
            <SearchBox onSubmit={onSubmit} namespaces={namespaces}/>
            <div className="mt-6">
                {results.map((result) => (
                    <div key={result.id} className="mb-3">
                        <Link key={result.id} href={`${process.env.NEXT_PUBLIC_ROOT_URL}${result.metadata?.path}`}>
                            <h2 className="text-xl">{result.metadata?.path}</h2>
                        </Link>
                        <p>{result.metadata?.preview}</p>
                    </div>
                ))}
            </div>
        </main>
  );
}
