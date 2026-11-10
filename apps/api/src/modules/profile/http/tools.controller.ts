import {
  type CreateToolRequest,
  CreateToolRequestSchema,
  type CreateToolResponse,
  type SearchToolsQuery,
  SearchToolsQuerySchema,
  type SearchToolsResponse,
  type Tool,
} from '@careerly/contracts';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../../platform/http/zod-validation.pipe.js';
import { InvalidToolNameError, ToolCatalogService } from '../application/tool-catalog.service.js';

interface StatusResponse {
  status(code: number): unknown;
}

@Controller('tools')
export class ToolsController {
  constructor(private readonly catalog: ToolCatalogService) {}

  @Get()
  async search(
    @Query(new ZodValidationPipe(SearchToolsQuerySchema)) query: SearchToolsQuery,
  ): Promise<SearchToolsResponse> {
    return { items: await this.catalog.search(query) };
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Tool> {
    const tool = await this.catalog.findById(id);
    if (!tool) {
      throw new NotFoundException('Tool not found.');
    }
    return tool;
  }

  /** 201 when a tool is created; 200 with the existing tool when the name already resolves to one. */
  @Post()
  async create(
    @Body(new ZodValidationPipe(CreateToolRequestSchema)) body: CreateToolRequest,
    @Res({ passthrough: true }) response: StatusResponse,
  ): Promise<CreateToolResponse> {
    try {
      const result = await this.catalog.create(body);
      response.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
      return result;
    } catch (error) {
      if (error instanceof InvalidToolNameError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
