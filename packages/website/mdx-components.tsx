import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';
import { File, Files, Folder } from 'fumadocs-ui/components/files';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { Pipeline } from '@/components/mdx/pipeline';

export function getMDXComponents(components?: MDXComponents): MDXComponents {
    return {
        ...defaultMdxComponents,
        Accordion,
        Accordions,
        File,
        Files,
        Folder,
        Step,
        Steps,
        Tab,
        Tabs,
        Pipeline,
        ...components,
    };
}
