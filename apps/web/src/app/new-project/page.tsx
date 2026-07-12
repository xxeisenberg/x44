"use client";

import GridContainer from "@/components/grid-container";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { authClient } from "@/lib/auth-client";
import { CheckIcon } from "lucide-react";
import { useEffect, useState } from "react";

export default function Page() {
  const [repos, setRepos] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function fetchRepos() {
      const response = await authClient.$fetch(
        "http://localhost:8787/api/repos",
      );
      if (response.error) {
        console.log(response.error);
        return;
      }
      const repos = response.data.repos;
      setRepos(repos);
    }
    fetchRepos();
  }, []);

  return (
    <GridContainer
      centerColumn={
        <Card className="w-[450px]">
          <CardHeader>
            <CardTitle>Create New Project</CardTitle>
            <CardDescription>Select a repository to deploy</CardDescription>
          </CardHeader>
          <CardContent>
            <Input
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search repositories..."
            />
            <ScrollArea className="h-[400px] mt-5 border rounded-2xl p-3">
              <RadioGroup value={selectedRepo} onValueChange={setSelectedRepo}>
                {repos
                  .filter((repo: any) =>
                    repo.name.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((repo: any) => {
                    const isSelected = selectedRepo === repo.name;
                    return (
                      <FieldLabel
                        key={repo.id}
                        onClick={() => setSelectedRepo(repo.name)}
                        className={`block border-none cursor-pointer rounded-xl transition-colors ${
                          isSelected ? "bg-muted" : "hover:bg-muted/50"
                        }`}
                      >
                        <Field
                          orientation="horizontal"
                          className="justify-between w-full"
                        >
                          <FieldContent>
                            <FieldTitle className="text-sm font-medium">
                              {repo.name}
                            </FieldTitle>
                          </FieldContent>

                          <div className="flex h-5 w-5 items-center justify-center">
                            {isSelected && (
                              <CheckIcon className="h-4 w-4 text-primary" />
                            )}
                          </div>

                          <RadioGroupItem
                            value={repo.name}
                            className="hidden"
                          />
                        </Field>
                      </FieldLabel>
                    );
                  })}
              </RadioGroup>
            </ScrollArea>
          </CardContent>
        </Card>
      }
      rightColumn={
        <ul className="space-y-4 text-sm text-neutral-500 select-none whitespace-nowrap">
          <li className="font-medium text-neutral-200">
            • Select a repository
          </li>
          <li>• Configure and deploy</li>
        </ul>
      }
    />
  );
}
