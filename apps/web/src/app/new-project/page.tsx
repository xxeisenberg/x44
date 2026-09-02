"use client";

import GridContainer from "@/components/grid-container";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { authClient } from "@/lib/auth-client";
import { useForm } from "@tanstack/react-form";
import { Repo } from "@x44/types";
import { CheckIcon } from "lucide-react";
import { useEffect, useState } from "react";

export default function Page() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [search, setSearch] = useState("");
  const [step, setStep] = useState<"repo" | "config">("repo");
  const [branches, setBranches] = useState<string[]>([]);

  const form = useForm({
    defaultValues: {
      repoName: "",
      branch: "",
      name: "",
      buildCommand: "npm run build",
      rootDirectory: "./",
      outputDirectory: "dist",
    },
    onSubmit: async ({ value }) => {
      const username = repos
        .find((r) => r.name === value.repoName)
        ?.full_name.split("/")[0];
      const body = { ...value, username: username! };
      const response = await authClient.$fetch(
        "http://localhost:8787/api/projects",
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      );
      console.log(response.data);
    },
  });

  useEffect(() => {
    async function fetchRepos() {
      const response = await authClient.$fetch(
        "http://localhost:8787/api/repos",
      );
      if (response.error) {
        console.log(response.error);
        return;
      }
      const data = response.data as { repos: Repo[] };
      setRepos(data.repos);
    }
    fetchRepos();
  }, []);

  return (
    <GridContainer
      centerColumn={
        step === "repo" ? (
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
                <form.Field
                  name="repoName"
                  children={(field) => (
                    <RadioGroup
                      value={field.state.value}
                      onValueChange={field.handleChange}
                    >
                      {repos
                        .filter((repo: any) =>
                          repo.name
                            .toLowerCase()
                            .includes(search.toLowerCase()),
                        )
                        .map((repo: any) => {
                          const isSelected = field.state.value === repo.name;
                          return (
                            <FieldLabel
                              key={repo.id}
                              onClick={() => field.handleChange(repo.name)}
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
                  )}
                />
              </ScrollArea>
            </CardContent>
            <CardFooter>
              <div className="flex justify-end w-full">
                <form.Subscribe
                  selector={(state) => state.values.repoName}
                  children={(repoName) => (
                    <Button
                      onClick={async () => {
                        const selectedRepo = repos.find(
                          (r: any) => r.name === repoName,
                        );
                        if (!selectedRepo) return;

                        try {
                          const response: { data: { branches: string[] } } =
                            await authClient.$fetch(
                              "http://localhost:8787/api/branches",
                              {
                                method: "POST",
                                body: JSON.stringify({
                                  repo_full_name: selectedRepo.full_name,
                                }),
                              },
                            );

                          if (response.data?.branches) {
                            setBranches(response.data.branches);
                            if (response.data.branches.length > 0) {
                              form.setFieldValue(
                                "branch",
                                response.data.branches[0],
                              );
                            }
                          }
                          setStep("config");
                        } catch (err) {
                          console.error("Failed to fetch branches:", err);
                        }
                      }}
                      disabled={!repoName}
                    >
                      Continue
                    </Button>
                  )}
                />
              </div>
            </CardFooter>
          </Card>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              form.handleSubmit();
            }}
          >
            <Card className="w-[450px]">
              <CardHeader>
                <CardTitle>Create New Project</CardTitle>
                <CardDescription>Configure your project</CardDescription>
              </CardHeader>
              <CardContent>
                <FieldSet>
                  <FieldGroup>
                    {/* Project Name Field */}
                    <form.Field
                      name="name"
                      children={(field) => (
                        <Field>
                          <FieldLabel htmlFor={field.name}>
                            Project name
                          </FieldLabel>
                          <Input
                            id={field.name}
                            name={field.name}
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(e) => field.handleChange(e.target.value)}
                          />
                        </Field>
                      )}
                    />

                    {/* Build Command Field */}
                    <form.Field
                      name="buildCommand"
                      children={(field) => (
                        <Field>
                          <FieldLabel htmlFor={field.name}>
                            Build command
                          </FieldLabel>
                          <Input
                            id={field.name}
                            name={field.name}
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(e) => field.handleChange(e.target.value)}
                          />
                        </Field>
                      )}
                    />

                    {/* Root Directory Field */}
                    <form.Field
                      name="rootDirectory"
                      children={(field) => (
                        <Field>
                          <FieldLabel htmlFor={field.name}>
                            Root directory
                          </FieldLabel>
                          <Input
                            id={field.name}
                            name={field.name}
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(e) => field.handleChange(e.target.value)}
                          />
                        </Field>
                      )}
                    />

                    {/* Output Directory Field */}
                    <form.Field
                      name="outputDirectory"
                      children={(field) => (
                        <Field>
                          <FieldLabel htmlFor={field.name}>
                            Output directory
                          </FieldLabel>
                          <Input
                            id={field.name}
                            name={field.name}
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(e) => field.handleChange(e.target.value)}
                          />
                        </Field>
                      )}
                    />

                    {/* Branch Select Field */}
                    <form.Field
                      name="branch"
                      children={(field) => (
                        <Field>
                          <FieldLabel htmlFor={field.name}>
                            Production Branch
                          </FieldLabel>
                          <Select
                            value={field.state.value}
                            onValueChange={(value) => field.handleChange(value)}
                          >
                            <SelectTrigger id={field.name} className="w-full">
                              <SelectValue placeholder="Select a branch" />
                            </SelectTrigger>
                            <SelectContent>
                              {branches?.map((branchName: any) => (
                                <SelectItem key={branchName} value={branchName}>
                                  {branchName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                      )}
                    />
                  </FieldGroup>
                </FieldSet>
              </CardContent>
              <CardFooter>
                <div className="flex justify-between w-full">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep("repo")}
                  >
                    Back
                  </Button>
                  <Button type="submit">Deploy</Button>
                </div>
              </CardFooter>
            </Card>
          </form>
        )
      }
      rightColumn={
        <ul className="space-y-4 text-sm text-neutral-500 select-none whitespace-nowrap">
          {step === "repo" ? (
            <>
              <li className="font-medium text-neutral-200">
                • Select a repository
              </li>
              <li>• Configure and deploy</li>
            </>
          ) : (
            <>
              <li>• Select a repository</li>
              <li className="font-medium text-neutral-200">
                • Configure and deploy
              </li>
            </>
          )}
        </ul>
      }
    />
  );
}
